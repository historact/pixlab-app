const fs = require('fs');
const nodemailer = require('nodemailer');
const { getSettings, sanitizeData } = require('./logger');

const throttleState = new Map();

function templateTokens(payload = {}) {
  const safe = sanitizeData(payload || {});
  const metrics = safe.metrics || {};
  const rule = safe.rule || {};
  return {
    time: safe.timestamp || new Date().toISOString(),
    level: safe.level || '',
    channel: safe.channel || '',
    event: safe.event || '',
    request_id: safe.request_id || '',
    method: safe.method || '',
    path: safe.path || '',
    endpoint: safe.endpoint || safe.rule_endpoint || rule.endpoint || '',
    action: safe.action || '',
    status: safe.status || '',
    code: safe.code || '',
    message: safe.message || '',
    ip: safe.ip || '',
    ua: safe.user_agent || safe.ua || '',
    duration_ms: safe.duration_ms || '',
    rule_name: safe.rule_name || rule.name || '',
    severity: safe.severity || rule.severity || safe.level || '',
    state: safe.state || '',
    since: safe.since || '',
    metric: safe.metric || rule.metric || safe.metric_key || '',
    operator: safe.operator || rule.operator || '',
    threshold: safe.threshold ?? rule.threshold ?? '',
    value: safe.value ?? '',
    scope: safe.scope || rule.scope || '',
    cpu_percent: metrics.cpu_percent ?? safe.cpu_percent ?? '',
    uptime_sec: metrics.uptime_sec ?? safe.uptime_sec ?? '',
    rss_mb: metrics.rss_mb ?? safe.rss_mb ?? '',
    heap_used_mb: metrics.heap_used_mb ?? safe.heap_used_mb ?? '',
    heap_total_mb: metrics.heap_total_mb ?? safe.heap_total_mb ?? '',
    event_loop_delay_ms: metrics.event_loop_delay_ms ?? safe.event_loop_delay_ms ?? '',
    req_per_min: metrics.req_per_min ?? safe.req_per_min ?? '',
    errors_per_min: metrics.errors_per_min ?? safe.errors_per_min ?? '',
    timeouts_per_min: metrics.timeouts_per_min ?? safe.timeouts_per_min ?? '',
    error_rate: metrics.error_rate ?? safe.error_rate ?? '',
    endpoint_req_per_min: metrics.endpoint_req_per_min ?? safe.endpoint_req_per_min ?? '',
    endpoint_errors_per_min: metrics.endpoint_errors_per_min ?? safe.endpoint_errors_per_min ?? '',
    endpoint_timeouts_per_min: metrics.endpoint_timeouts_per_min ?? safe.endpoint_timeouts_per_min ?? '',
    endpoint_error_rate: metrics.endpoint_error_rate ?? safe.endpoint_error_rate ?? '',
    endpoint_avg_latency_ms: metrics.endpoint_avg_latency_ms ?? safe.endpoint_avg_latency_ms ?? '',
    endpoint_p95_latency_ms: metrics.endpoint_p95_latency_ms ?? safe.endpoint_p95_latency_ms ?? '',
    queue_active: metrics.queue_active ?? safe.queue_active ?? '',
    queue_queued: metrics.queue_queued ?? safe.queue_queued ?? '',
  };
}

function applyTemplate(template, tokens) {
  let message = template;
  for (const [key, value] of Object.entries(tokens)) {
    message = message.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value ?? ''));
  }
  return message;
}

function shouldSend(key, cooldownSeconds) {
  const now = Date.now();
  const last = throttleState.get(key) || 0;
  if (now - last < cooldownSeconds * 1000) return false;
  throttleState.set(key, now);
  return true;
}

function getEmailTransport() {
  const host = process.env.ALERT_EMAIL_HOST;
  if (!host) return null;
  const port = parseInt(process.env.ALERT_EMAIL_PORT, 10) || 587;
  const secure = String(process.env.ALERT_EMAIL_SECURE || '').toLowerCase() === 'true';
  const user = process.env.ALERT_EMAIL_USER || null;
  const pass = process.env.ALERT_EMAIL_PASS || null;
  const auth = user && pass ? { user, pass } : null;
  return nodemailer.createTransport({ host, port, secure, auth });
}

async function sendEmailAlert(recipients, subject, message, attachments = []) {
  const transport = getEmailTransport();
  if (!transport) return { ok: false, error: 'email_transport_missing' };
  const from = process.env.ALERT_EMAIL_FROM || process.env.ALERT_EMAIL_USER || 'pixlab@localhost';
  await transport.sendMail({
    from,
    to: recipients.join(','),
    subject,
    text: message,
    attachments,
  });
  return { ok: true };
}

async function sendTelegramAlert(targets, message) {
  const token = process.env.ALERT_TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, error: 'telegram_token_missing' };
  const results = [];
  for (const target of targets) {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: target, text: message }),
    });
    results.push({ ok: res.ok, status: res.status });
  }
  return { ok: results.every(r => r.ok), results };
}

async function sendTelegramPhoto(targets, photo) {
  const token = process.env.ALERT_TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, error: 'telegram_token_missing' };
  const results = [];
  const { path: photoPath, buffer, caption } = photo || {};
  if (!photoPath && !buffer) return { ok: false, error: 'telegram_photo_missing' };

  for (const target of targets) {
    const form = new FormData();
    form.append('chat_id', target);
    if (caption) form.append('caption', caption);
    if (buffer) {
      form.append('photo', new Blob([buffer]), 'monitoring.png');
    } else {
      form.append('photo', fs.createReadStream(photoPath));
    }
    const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: 'POST',
      body: form,
    });
    results.push({ ok: res.ok, status: res.status });
  }
  return { ok: results.every(r => r.ok), results };
}

async function sendAlert(payload, { force = false, attachments = [], telegramPhoto = null, channelsOverride = null } = {}) {
  const settings = getSettings();
  const effectiveChannels = channelsOverride || {};
  const tokens = templateTokens(payload);
  const cooldownSeconds = Number(settings.alerts.cooldown_seconds) || 0;
  const dedupeKey = `${payload.channel || 'runtime'}:${payload.level || 'info'}:${payload.event || ''}`;
  if (!force && cooldownSeconds > 0 && !shouldSend(dedupeKey, cooldownSeconds)) {
    return { ok: false, throttled: true };
  }

  const results = [];
  const emailEnabled = Boolean(settings.alerts.email.enabled) && effectiveChannels.email !== false;
  const telegramEnabled = Boolean(settings.alerts.telegram.enabled) && effectiveChannels.telegram !== false;

  if (emailEnabled && settings.alerts.email.recipients?.length) {
    const subject = `[PixLab] ${tokens.level} ${tokens.event}`.trim();
    const message = applyTemplate(settings.alerts.email.template, tokens);
    results.push(await sendEmailAlert(settings.alerts.email.recipients, subject, message, attachments));
  }
  if (telegramEnabled && settings.alerts.telegram.targets?.length) {
    const message = applyTemplate(settings.alerts.telegram.template, tokens);
    if (telegramPhoto) {
      results.push(await sendTelegramPhoto(settings.alerts.telegram.targets, telegramPhoto));
    } else {
      results.push(await sendTelegramAlert(settings.alerts.telegram.targets, message));
    }
  }
  if (!results.length) {
    return { ok: false, error: 'no_channels' };
  }
  return { ok: results.every(r => r.ok), results };
}

module.exports = {
  sendAlert,
  templateTokens,
  applyTemplate,
};
