const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const { getSettings, sanitizeData, logInternal } = require('./logger');

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
    snapshot_url: safe.snapshot_url || '',
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
  if (String(process.env.ALERT_EMAIL_JSON_TRANSPORT || '').toLowerCase() === 'true') {
    return nodemailer.createTransport({ jsonTransport: true });
  }
  if (!host) return null;
  const port = parseInt(process.env.ALERT_EMAIL_PORT, 10) || 587;
  const secure = String(process.env.ALERT_EMAIL_SECURE || '').toLowerCase() === 'true';
  const user = process.env.ALERT_EMAIL_USER || null;
  const pass = process.env.ALERT_EMAIL_PASS || null;
  const auth = user && pass ? { user, pass } : null;
  return nodemailer.createTransport({ host, port, secure, auth });
}

async function sendEmailAlert(recipients, subject, message, { attachments = [], html = null } = {}) {
  const transport = getEmailTransport();
  if (!transport) return { ok: false, error: 'email_transport_missing' };
  const from = process.env.ALERT_EMAIL_FROM || process.env.ALERT_EMAIL_USER || 'pixlab@localhost';
  try {
    await transport.sendMail({
      from,
      to: recipients.join(','),
      subject,
      text: message,
      html: html || undefined,
      attachments,
    });
    logInternal('alert.email.sent', {
      recipients: recipients.length,
      attachments: attachments.length,
      inline_attachments: attachments.filter(item => item && item.cid).length,
    });
    return { ok: true };
  } catch (err) {
    logInternal('alert.email.error', {
      error_name: err?.name,
      error_message: err?.message,
    }, 'error');
    return { ok: false, error: 'email_send_failed' };
  }
}

function getTelegramApiBaseUrl() {
  return process.env.ALERT_TELEGRAM_API_BASE_URL || 'https://api.telegram.org';
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function appendSnapshotLink(message, snapshotUrl) {
  if (!snapshotUrl) return message;
  if (message.includes(snapshotUrl)) return message;
  return `${message}\nSnapshot: ${snapshotUrl}`;
}

async function sendTelegramAlert(targets, message) {
  const token = process.env.ALERT_TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, error: 'telegram_token_missing' };
  const results = [];
  for (const target of targets) {
    try {
      const res = await fetch(`${getTelegramApiBaseUrl()}/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: target, text: message }),
      });
      const payload = await res.json().catch(() => ({}));
      logInternal('alert.telegram.message_response', {
        ok: res.ok,
        status: res.status,
        target,
        error_code: payload.error_code,
        description: payload.description,
      });
      results.push({ ok: res.ok, status: res.status });
    } catch (err) {
      logInternal('alert.telegram.message_error', {
        target,
        error_name: err?.name,
        error_message: err?.message,
      }, 'error');
      results.push({ ok: false, status: null });
    }
  }
  return { ok: results.every(r => r.ok), results };
}

async function sendTelegramPhoto(targets, photo) {
  const token = process.env.ALERT_TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, error: 'telegram_token_missing' };
  const results = [];
  const { path: photoPath, buffer, caption, contentType, filename } = photo || {};
  if (!photoPath && !buffer) return { ok: false, error: 'telegram_photo_missing' };

  for (const target of targets) {
    let photoBuffer = buffer;
    if (!photoBuffer) {
      photoBuffer = await fs.promises.readFile(photoPath);
    }
    logInternal('alert.telegram.photo_send', {
      target,
      bytes: photoBuffer.length,
      content_type: contentType || 'application/octet-stream',
      filename: filename || (photoPath ? path.basename(photoPath) : 'monitoring.png'),
    });
    try {
      const form = new FormData();
      form.append('chat_id', target);
      if (caption) form.append('caption', caption);
      const blob = new Blob([photoBuffer], { type: contentType || 'application/octet-stream' });
      form.append('photo', blob, filename || (photoPath ? path.basename(photoPath) : 'monitoring.png'));
      const res = await fetch(`${getTelegramApiBaseUrl()}/bot${token}/sendPhoto`, {
        method: 'POST',
        body: form,
      });
      const payload = await res.json().catch(() => ({}));
      logInternal('alert.telegram.photo_response', {
        ok: res.ok,
        status: res.status,
        target,
        error_code: payload.error_code,
        description: payload.description,
      });
      results.push({ ok: res.ok, status: res.status });
    } catch (err) {
      logInternal('alert.telegram.photo_error', {
        target,
        error_name: err?.name,
        error_message: err?.message,
      }, 'error');
      results.push({ ok: false, status: null });
    }
  }
  return { ok: results.every(r => r.ok), results };
}

function inferContentType(filePath) {
  const ext = path.extname(filePath || '').toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.gif') return 'image/gif';
  return 'application/octet-stream';
}

async function prepareAttachments(attachments = []) {
  const prepared = [];
  for (const attachment of attachments) {
    if (!attachment) continue;
    if (attachment.content) {
      prepared.push(attachment);
      continue;
    }
    if (!attachment.path) continue;
    const filePath = attachment.path;
    let stats = null;
    try {
      stats = await fs.promises.stat(filePath);
    } catch {
      stats = null;
    }
    const exists = Boolean(stats);
    const size = stats?.size || 0;
    const contentType = attachment.contentType || inferContentType(filePath);
    const filename = attachment.filename || path.basename(filePath);
    logInternal('alert.media.attachment_check', {
      filename,
      exists,
      size,
      content_type: contentType,
    });
    if (!exists || size <= 0) continue;
    const content = await fs.promises.readFile(filePath);
    prepared.push({
      ...attachment,
      filename,
      contentType,
      content,
    });
  }
  return prepared;
}

async function prepareTelegramPhoto(telegramPhoto) {
  if (!telegramPhoto) return null;
  if (telegramPhoto.buffer) {
    return telegramPhoto;
  }
  if (!telegramPhoto.path) return null;
  const filePath = telegramPhoto.path;
  let stats = null;
  try {
    stats = await fs.promises.stat(filePath);
  } catch {
    stats = null;
  }
  const exists = Boolean(stats);
  const size = stats?.size || 0;
  const contentType = telegramPhoto.contentType || inferContentType(filePath);
  const filename = telegramPhoto.filename || path.basename(filePath);
  logInternal('alert.media.telegram_photo_check', {
    filename,
    exists,
    size,
    content_type: contentType,
  });
  if (!exists || size <= 0) return null;
  const buffer = await fs.promises.readFile(filePath);
  return {
    buffer,
    caption: telegramPhoto.caption,
    contentType,
    filename,
  };
}

async function sendAlert(payload, { force = false, attachments = [], telegramPhoto = null, channelsOverride = null } = {}) {
  const settings = getSettings();
  const effectiveChannels = channelsOverride || {};
  const tokens = templateTokens(payload);
  const snapshotUrl = tokens.snapshot_url || '';
  const cooldownSeconds = Number(settings.alerts.cooldown_seconds) || 0;
  const dedupeKey = `${payload.channel || 'runtime'}:${payload.level || 'info'}:${payload.event || ''}`;
  if (!force && cooldownSeconds > 0 && !shouldSend(dedupeKey, cooldownSeconds)) {
    return { ok: false, throttled: true };
  }

  const results = [];
  const emailEnabled = Boolean(settings.alerts.email.enabled) && effectiveChannels.email !== false;
  const telegramEnabled = Boolean(settings.alerts.telegram.enabled) && effectiveChannels.telegram !== false;
  const preparedAttachments = emailEnabled ? await prepareAttachments(attachments) : [];
  const emailAttachments = preparedAttachments.map(attachment => {
    if (!attachment) return attachment;
    if (attachment.cid) return attachment;
    if (attachment.contentType && attachment.contentType.startsWith('image/')) {
      return { ...attachment, cid: attachment.cid || 'snapshot@pixlab' };
    }
    return attachment;
  });
  const preparedTelegramPhoto = telegramEnabled ? await prepareTelegramPhoto(telegramPhoto) : null;
  if (!preparedTelegramPhoto && telegramPhoto) {
    logInternal('alert.telegram.photo_missing', {
      path: telegramPhoto.path || null,
    }, 'warn');
  }
  if (!preparedAttachments.length && attachments.length) {
    logInternal('alert.email.attachments_missing', {
      requested: attachments.length,
    }, 'warn');
  }

  if (emailEnabled && settings.alerts.email.recipients?.length) {
    const subject = `[PixLab] ${tokens.level} ${tokens.event}`.trim();
    let message = applyTemplate(settings.alerts.email.template, tokens);
    if (!emailAttachments.length) {
      message = appendSnapshotLink(message, snapshotUrl);
    }
    const inlineAttachment = emailAttachments.find(item => item?.cid);
    const html = inlineAttachment
      ? `<p>${escapeHtml(message).replace(/\n/g, '<br />')}</p><p><img alt="Snapshot" src="cid:${inlineAttachment.cid}" /></p>`
      : `<p>${escapeHtml(message).replace(/\n/g, '<br />')}</p>`;
    results.push(
      await sendEmailAlert(settings.alerts.email.recipients, subject, message, {
        attachments: emailAttachments,
        html,
      })
    );
  }
  if (telegramEnabled && settings.alerts.telegram.targets?.length) {
    let message = applyTemplate(settings.alerts.telegram.template, tokens);
    if (!preparedTelegramPhoto) {
      message = appendSnapshotLink(message, snapshotUrl);
    }
    if (preparedTelegramPhoto) {
      results.push(await sendTelegramPhoto(settings.alerts.telegram.targets, preparedTelegramPhoto));
    }
    results.push(await sendTelegramAlert(settings.alerts.telegram.targets, message));
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
  prepareAttachments,
  prepareTelegramPhoto,
};
