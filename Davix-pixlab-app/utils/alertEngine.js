const { query, pool } = require('../db');
const { getSettings, logInternal } = require('./logger');
const { sendAlert } = require('./alerts');
const { getMetricsSnapshot, resolveMetricValueFromSnapshot, endpoints } = require('./metrics');
const { buildSnapshotUrl, generateAlertSnapshot } = require('./monitoringSnapshot');

const OWNER_ID = `alert-engine-${process.pid}`;
const DEFAULT_EVAL_INTERVAL_SEC = 10;
const LOCK_NAME = 'alert_engine';
const LEASE_SECONDS = 90;
const LEASE_HEARTBEAT_MS = 20000;

const ALLOWED_OPERATORS = new Set(['>', '>=', '<', '<=', '==', '!=']);
const ALLOWED_SEVERITIES = new Set(['info', 'warn', 'error']);
const ALLOWED_METRICS = new Set([
  'cpu_percent',
  'memory_rss_bytes',
  'heap_used_bytes',
  'heap_total_bytes',
  'event_loop_delay_ms',
  'uptime_sec',
  'req_per_min',
  'errors_per_min',
  'timeouts_per_min',
  'error_rate',
  'latency_avg_ms',
  'latency_p95_ms',
  'queue_active',
  'queue_queued',
]);

let evaluatorInterval = null;
let evaluationInProgress = false;

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeRule(row) {
  return {
    ...row,
    scope: parseJson(row.scope_json, {}),
    channels: parseJson(row.channels_json, {}),
  };
}

function normalizeOptionalInt(value, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.floor(num);
}

function normalizeRulePayload(payload = {}, { requireId = false } = {}) {
  const errors = [];
  const normalized = {
    id: payload.id == null || payload.id === '' ? null : Number(payload.id),
    name: typeof payload.name === 'string' ? payload.name.trim() : '',
    enabled: payload.enabled === undefined ? true : Boolean(payload.enabled),
    metric_key: typeof payload.metric_key === 'string' ? payload.metric_key.trim() : '',
    operator: typeof payload.operator === 'string' ? payload.operator.trim() : '',
    threshold: Number(payload.threshold),
    for_sec: normalizeOptionalInt(payload.for_sec, 0),
    eval_interval_sec: normalizeOptionalInt(payload.eval_interval_sec, DEFAULT_EVAL_INTERVAL_SEC),
    cooldown_sec: normalizeOptionalInt(payload.cooldown_sec, 0),
    severity: typeof payload.severity === 'string' ? payload.severity.trim().toLowerCase() : 'info',
    scope: payload.scope && typeof payload.scope === 'object' ? payload.scope : {},
    channels: payload.channels && typeof payload.channels === 'object' ? payload.channels : {},
  };

  if (requireId && (!Number.isFinite(normalized.id) || normalized.id <= 0)) {
    errors.push({ field: 'id', message: 'id is required and must be a positive integer.' });
  }

  if (!normalized.name) {
    errors.push({ field: 'name', message: 'name is required.' });
  }

  if (!ALLOWED_METRICS.has(normalized.metric_key)) {
    errors.push({ field: 'metric_key', message: 'metric_key is invalid.' });
  }

  if (!ALLOWED_OPERATORS.has(normalized.operator)) {
    errors.push({ field: 'operator', message: 'operator is invalid.' });
  }

  if (!Number.isFinite(normalized.threshold)) {
    errors.push({ field: 'threshold', message: 'threshold must be a finite number.' });
  }

  if (!Number.isFinite(normalized.for_sec) || normalized.for_sec < 0) {
    errors.push({ field: 'for_sec', message: 'for_sec must be >= 0.' });
  }

  if (!Number.isFinite(normalized.eval_interval_sec) || normalized.eval_interval_sec < 5 || normalized.eval_interval_sec > 3600) {
    errors.push({ field: 'eval_interval_sec', message: 'eval_interval_sec must be between 5 and 3600 seconds.' });
  }

  if (!Number.isFinite(normalized.cooldown_sec) || normalized.cooldown_sec < 0 || normalized.cooldown_sec > 86400) {
    errors.push({ field: 'cooldown_sec', message: 'cooldown_sec must be between 0 and 86400 seconds.' });
  }

  if (!ALLOWED_SEVERITIES.has(normalized.severity)) {
    errors.push({ field: 'severity', message: 'severity must be one of info/warn/error.' });
  }

  const endpoint = normalized.scope?.endpoint;
  if (endpoint !== undefined && endpoint !== null && endpoint !== '') {
    if (typeof endpoint !== 'string' || !endpoints.includes(endpoint)) {
      errors.push({ field: 'scope.endpoint', message: 'scope.endpoint must be one of known endpoint keys.' });
    }
  }

  if (Object.prototype.hasOwnProperty.call(normalized.channels, 'email') && typeof normalized.channels.email !== 'boolean') {
    errors.push({ field: 'channels.email', message: 'channels.email must be boolean.' });
  }
  if (Object.prototype.hasOwnProperty.call(normalized.channels, 'telegram') && typeof normalized.channels.telegram !== 'boolean') {
    errors.push({ field: 'channels.telegram', message: 'channels.telegram must be boolean.' });
  }

  return {
    ok: errors.length === 0,
    errors,
    value: normalized,
  };
}

function validateRulePayload(payload, options = {}) {
  const result = normalizeRulePayload(payload, options);
  return {
    ok: result.ok,
    errors: result.errors,
  };
}

async function listRules() {
  const rows = await query('SELECT * FROM alert_rules ORDER BY id DESC');
  return rows.map(normalizeRule);
}

async function upsertRule(payload) {
  const normalized = normalizeRulePayload(payload, { requireId: false });
  if (!normalized.ok) {
    const err = new Error('INVALID_RULE');
    err.code = 'INVALID_RULE';
    err.status = 400;
    err.errors = normalized.errors;
    throw err;
  }

  const rule = normalized.value;
  const scopeJson = JSON.stringify(rule.scope || {});
  const channelsJson = JSON.stringify(rule.channels || {});

  if (rule.id) {
    await query(
      `UPDATE alert_rules
       SET name = ?, enabled = ?, metric_key = ?, scope_json = ?, operator = ?, threshold = ?,
           for_sec = ?, eval_interval_sec = ?, cooldown_sec = ?, severity = ?, channels_json = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        rule.name,
        rule.enabled ? 1 : 0,
        rule.metric_key,
        scopeJson,
        rule.operator,
        rule.threshold,
        rule.for_sec,
        rule.eval_interval_sec || DEFAULT_EVAL_INTERVAL_SEC,
        rule.cooldown_sec || 0,
        rule.severity || 'info',
        channelsJson,
        rule.id,
      ]
    );
    return rule.id;
  }

  const result = await query(
    `INSERT INTO alert_rules
       (name, enabled, metric_key, scope_json, operator, threshold, for_sec, eval_interval_sec, cooldown_sec, severity, channels_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      rule.name,
      rule.enabled ? 1 : 0,
      rule.metric_key,
      scopeJson,
      rule.operator,
      rule.threshold,
      rule.for_sec,
      rule.eval_interval_sec || DEFAULT_EVAL_INTERVAL_SEC,
      rule.cooldown_sec || 0,
      rule.severity || 'info',
      channelsJson,
    ]
  );
  return result.insertId;
}

async function deleteRule(ruleId) {
  await query('DELETE FROM alert_rules WHERE id = ?', [ruleId]);
  await query('DELETE FROM alert_state WHERE rule_id = ?', [ruleId]);
}

async function listActiveAlerts() {
  const rows = await query(
    `SELECT s.*, r.name, r.metric_key, r.severity, r.scope_json
     FROM alert_state s
     JOIN alert_rules r ON r.id = s.rule_id
     WHERE s.state = 'FIRING'
     ORDER BY s.last_change_at DESC`
  );
  return rows.map(row => ({
    ...row,
    scope: parseJson(row.scope_json, {}),
  }));
}

async function listResolvedAlerts() {
  const rows = await query(
    `SELECT s.*, r.name, r.metric_key, r.severity, r.scope_json
     FROM alert_state s
     JOIN alert_rules r ON r.id = s.rule_id
     WHERE s.state = 'RESOLVED'
     ORDER BY s.last_change_at DESC
     LIMIT 200`
  );
  return rows.map(row => ({
    ...row,
    scope: parseJson(row.scope_json, {}),
  }));
}

async function ackAlert(ruleId, durationSec) {
  await query(
    `UPDATE alert_state
     SET ack_until = DATE_ADD(NOW(), INTERVAL ? SECOND)
     WHERE rule_id = ?`,
    [durationSec, ruleId]
  );
}

async function silenceAlert(ruleId, durationSec) {
  await query(
    `UPDATE alert_state
     SET silence_until = DATE_ADD(NOW(), INTERVAL ? SECOND)
     WHERE rule_id = ?`,
    [durationSec, ruleId]
  );
}

async function acquireLease() {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(
      'SELECT owner_id, lease_until FROM lease_locks WHERE name = ? FOR UPDATE',
      [LOCK_NAME]
    );
    const now = new Date();
    const leaseUntil = rows?.[0]?.lease_until ? new Date(rows[0].lease_until) : null;
    if (leaseUntil && leaseUntil > now) {
      await conn.rollback();
      return { ok: false };
    }
    await conn.query(
      `INSERT INTO lease_locks (name, owner_id, lease_until)
       VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND))
       ON DUPLICATE KEY UPDATE owner_id = VALUES(owner_id), lease_until = VALUES(lease_until)`,
      [LOCK_NAME, OWNER_ID, LEASE_SECONDS]
    );
    await conn.commit();
    return { ok: true, ownerId: OWNER_ID };
  } catch (err) {
    await conn.rollback();
    logInternal('alert_engine.lease_failed', { message: err.message }, 'warn');
    return { ok: false };
  } finally {
    conn.release();
  }
}

async function renewLease(ownerId) {
  const result = await query(
    `UPDATE lease_locks
     SET lease_until = DATE_ADD(NOW(), INTERVAL ? SECOND)
     WHERE name = ? AND owner_id = ?`,
    [LEASE_SECONDS, LOCK_NAME, ownerId]
  );
  return (result?.affectedRows || 0) > 0;
}

async function releaseLease(ownerId) {
  try {
    await query('DELETE FROM lease_locks WHERE name = ? AND owner_id = ?', [LOCK_NAME, ownerId]);
  } catch (err) {
    logInternal('alert_engine.lease_release_failed', { message: err.message }, 'warn');
  }
}

function compare(operator, value, threshold) {
  switch (operator) {
    case '>':
      return value > threshold;
    case '>=':
      return value >= threshold;
    case '<':
      return value < threshold;
    case '<=':
      return value <= threshold;
    case '==':
      return value === threshold;
    case '!=':
      return value !== threshold;
    default:
      return false;
  }
}

async function upsertState(ruleId, updates) {
  const fields = [];
  const values = [];
  for (const [key, value] of Object.entries(updates)) {
    fields.push(`${key} = ?`);
    values.push(value);
  }
  if (!fields.length) return;
  await query(
    `INSERT INTO alert_state (rule_id, state, last_change_at)
     VALUES (?, 'OK', NOW())
     ON DUPLICATE KEY UPDATE ${fields.join(', ')}`,
    [ruleId, ...values]
  );
}

async function recordEvent(ruleId, state, value, message) {
  const result = await query(
    `INSERT INTO alert_events (rule_id, state, value, message)
     VALUES (?, ?, ?, ?)`,
    [ruleId, state, value, message]
  );
  return result?.insertId || null;
}

function buildAlertMessage(rule, value) {
  const scopeLabel = rule.scope?.endpoint ? `endpoint=${rule.scope.endpoint}` : 'global';
  return `[${rule.severity}] ${rule.name} (${rule.metric_key} ${rule.operator} ${rule.threshold}) ${scopeLabel} value=${value}`;
}

function buildIncidentId(ruleId, timestamp) {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp || Date.now());
  return `${ruleId}:${date.toISOString()}`;
}

function shouldAttemptIncidentNotify(stateRow, incidentId, fireStartAt) {
  if (!stateRow?.last_notified_at) return true;
  const notifiedAt = new Date(stateRow.last_notified_at);
  if (!Number.isFinite(notifiedAt.getTime())) return true;
  if (!stateRow.incident_id || stateRow.incident_id !== incidentId) return true;
  if (fireStartAt && notifiedAt < fireStartAt) return true;
  return false;
}

function deliveredAny(result) {
  const channelResults = Array.isArray(result?.channelResults) ? result.channelResults : [];
  return channelResults.some(item => item && item.ok === true);
}

async function maybeNotifyFiringRule({
  rule,
  stateRow,
  snapshot,
  value,
  endpointStats,
  queueStats,
  message,
  incidentId,
  fireStartAt,
  alertEventId,
  globalCooldown,
  snapshotResult,
  snapshotFallbackUrl,
  snapshotImageUrl,
}) {
  const now = new Date();
  const cooldownSec = Math.max(globalCooldown, Number(rule.cooldown_sec) || 0);
  const lastFire = stateRow?.last_fire_at ? new Date(stateRow.last_fire_at) : null;
  const onCooldown = lastFire && now - lastFire < cooldownSec * 1000;
  const silenceUntil = stateRow?.silence_until ? new Date(stateRow.silence_until) : null;
  const ackUntil = stateRow?.ack_until ? new Date(stateRow.ack_until) : null;
  const suppressed = (silenceUntil && silenceUntil > now) || (ackUntil && ackUntil > now);
  const shouldNotifyNow = !onCooldown && !suppressed && shouldAttemptIncidentNotify(stateRow, incidentId, fireStartAt);

  if (!shouldNotifyNow) {
    return { sent: false, reason: onCooldown ? 'cooldown' : suppressed ? 'suppressed' : 'already_notified' };
  }

  const endpoint = rule.scope?.endpoint || '';
  const notifyResult = await sendAlert(
    {
      channel: 'runtime',
      level: rule.severity || 'warn',
      event: 'monitoring.alert.firing',
      message,
      rule_name: rule.name,
      rule_endpoint: endpoint,
      severity: rule.severity || 'warn',
      state: 'FIRING',
      rule_id: rule.id,
      alert_id: alertEventId,
      incident_id: incidentId,
      fired_at: fireStartAt.toISOString(),
      since: fireStartAt.toISOString(),
      metric: rule.metric_key,
      operator: rule.operator,
      threshold: rule.threshold,
      value,
      snapshot_url: snapshotFallbackUrl,
      snapshot_view_url: snapshotFallbackUrl,
      snapshot_image_url: snapshotImageUrl,
      scope: endpoint ? 'endpoint=' + endpoint : 'global',
      metrics: {
        cpu_percent: snapshot.process.cpu_percent,
        uptime_sec: snapshot.process.uptime_sec,
        rss_mb: snapshot.process.memory_rss_bytes / 1024 / 1024,
        heap_used_mb: snapshot.process.heap_used_bytes / 1024 / 1024,
        heap_total_mb: snapshot.process.heap_total_bytes / 1024 / 1024,
        event_loop_delay_ms: snapshot.process.event_loop_delay_ms,
        req_per_min: snapshot.requests.per_minute_global,
        errors_per_min: snapshot.requests.errors_per_minute,
        timeouts_per_min: snapshot.requests.timeouts_per_minute,
        error_rate: snapshot.requests.error_rate_global,
        endpoint_req_per_min: endpointStats?.per_minute ?? '',
        endpoint_errors_per_min: endpointStats?.errors_per_min ?? '',
        endpoint_timeouts_per_min: endpointStats?.timeouts_per_min ?? '',
        endpoint_error_rate: endpointStats?.error_rate ?? '',
        endpoint_avg_latency_ms: endpointStats?.avg_latency_ms ?? '',
        endpoint_p95_latency_ms: endpointStats?.p95_latency_ms ?? '',
        queue_active: queueStats?.active ?? '',
        queue_queued: queueStats?.queued ?? '',
      },
    },
    {
      attachments: snapshotResult?.buffer
        ? [
            {
              filename: snapshotResult.filename || 'monitoring.png',
              content: snapshotResult.buffer,
              contentType: snapshotResult.contentType || 'image/png',
            },
          ]
        : [],
      telegramPhoto: snapshotResult?.buffer
        ? {
            buffer: snapshotResult.buffer,
            contentType: snapshotResult.contentType || 'image/png',
            caption: message,
            filename: snapshotResult.filename || 'monitoring.png',
          }
        : null,
      channelsOverride: rule.channels || null,
    }
  );

  if (notifyResult?.throttled) {
    logInternal('alert_engine.notify_throttled', { rule_id: rule.id, incident_id: incidentId }, 'warn');
    return { sent: false, reason: 'throttled', result: notifyResult };
  }

  if (notifyResult?.error === 'no_channels') {
    logInternal('alert_engine.notify_no_channels', { rule_id: rule.id, incident_id: incidentId }, 'warn');
    return { sent: false, reason: 'no_channels', result: notifyResult };
  }

  if (notifyResult?.ok || deliveredAny(notifyResult)) {
    await upsertState(rule.id, {
      last_notified_at: now,
      incident_id: incidentId,
      last_eval_at: now,
    });
    return { sent: true, result: notifyResult };
  }

  return { sent: false, reason: 'notify_failed', result: notifyResult };
}

async function evaluateRule(rule, stateRow, globalCooldown) {
  const snapshot = getMetricsSnapshot();
  const value = resolveMetricValueFromSnapshot(rule.metric_key, rule.scope, snapshot);
  if (value === null || value === undefined) return;

  const now = new Date();
  const conditionMet = compare(rule.operator, Number(value), Number(rule.threshold));
  const forSec = Number(rule.for_sec) || 0;

  const state = stateRow?.state || 'OK';
  const pendingSince = stateRow?.pending_since ? new Date(stateRow.pending_since) : null;
  const shouldFire = conditionMet && (!forSec || (pendingSince && now - pendingSince >= forSec * 1000));

  if (conditionMet && forSec && !pendingSince) {
    await upsertState(rule.id, {
      pending_since: now,
      last_eval_at: now,
      last_value: value,
    });
    return;
  }

  if (!conditionMet) {
    if (state === 'FIRING') {
      await upsertState(rule.id, {
        state: 'RESOLVED',
        last_change_at: now,
        pending_since: null,
        last_eval_at: now,
        last_value: value,
        incident_id: null,
      });
      await recordEvent(rule.id, 'RESOLVED', value, buildAlertMessage(rule, value));
    } else {
      await upsertState(rule.id, {
        state: 'OK',
        pending_since: null,
        last_eval_at: now,
        last_value: value,
      });
    }
    return;
  }

  const endpoint = rule.scope?.endpoint || '';
  const endpointStats = endpoint ? snapshot.endpoints?.[endpoint] : null;
  const queueStats = endpoint ? snapshot.queues?.[endpoint] : null;

  if (shouldFire && state !== 'FIRING') {
    const message = buildAlertMessage(rule, value);
    const snapshotViewUrl = buildSnapshotUrl(rule.id, { view: true });
    const snapshotImageUrl = buildSnapshotUrl(rule.id, { view: false });

    let snapshotResult = null;
    try {
      snapshotResult = await generateAlertSnapshot(rule.id);
      if (snapshotResult?.buffer?.length) {
        logInternal('alert_engine.snapshot_ready', {
          rule_id: rule.id,
          bytes: snapshotResult.buffer.length,
          source: snapshotResult.source || 'unknown',
        });
      }
    } catch (err) {
      logInternal('alert_engine.snapshot_failed', { rule_id: rule.id, message: err.message }, 'warn');
    }
    const snapshotFallbackUrl = snapshotResult?.snapshotUrlPublicFallback || snapshotViewUrl;
    const incidentStart = now;
    const incidentId = buildIncidentId(rule.id, incidentStart);

    await upsertState(rule.id, {
      state: 'FIRING',
      last_change_at: now,
      last_fire_at: now,
      pending_since: null,
      last_eval_at: now,
      last_value: value,
      last_snapshot_path: snapshotResult?.filePath || null,
      last_message: message,
      incident_id: incidentId,
    });
    const alertEventId = await recordEvent(rule.id, 'FIRING', value, message);
    await maybeNotifyFiringRule({
      rule,
      stateRow: {
        ...(stateRow || {}),
        state: 'FIRING',
        last_fire_at: now,
        incident_id: incidentId,
      },
      snapshot,
      value,
      endpointStats,
      queueStats,
      message,
      incidentId,
      fireStartAt: incidentStart,
      alertEventId,
      globalCooldown,
      snapshotResult,
      snapshotFallbackUrl,
      snapshotImageUrl,
    });
    return;
  }

  if (state === 'FIRING') {
    const message = stateRow?.last_message || buildAlertMessage(rule, value);
    const fireStartAt = stateRow?.last_change_at ? new Date(stateRow.last_change_at) : now;
    const incidentId = stateRow?.incident_id || buildIncidentId(rule.id, fireStartAt);
    const snapshotViewUrl = buildSnapshotUrl(rule.id, { view: true });
    const snapshotImageUrl = buildSnapshotUrl(rule.id, { view: false });

    await maybeNotifyFiringRule({
      rule,
      stateRow,
      snapshot,
      value,
      endpointStats,
      queueStats,
      message,
      incidentId,
      fireStartAt,
      alertEventId: stateRow?.last_alert_event_id || null,
      globalCooldown,
      snapshotResult: null,
      snapshotFallbackUrl: snapshotViewUrl,
      snapshotImageUrl,
    });

    await upsertState(rule.id, {
      incident_id: incidentId,
      last_eval_at: now,
      last_value: value,
    });
    return;
  }

  await upsertState(rule.id, {
    last_eval_at: now,
    last_value: value,
  });
}

async function evaluateAlerts() {
  if (evaluationInProgress) {
    logInternal('alert_engine.skip_overlap', {}, 'warn');
    return;
  }
  evaluationInProgress = true;
  let leaseOwner = null;
  let heartbeat = null;
  let leaseLost = false;

  try {
    const lease = await acquireLease();
    if (!lease.ok) return;
    leaseOwner = lease.ownerId;

    heartbeat = setInterval(async () => {
      try {
        const renewed = await renewLease(leaseOwner);
        if (!renewed) {
          leaseLost = true;
          logInternal('alert_engine.lease_lost', { owner_id: leaseOwner }, 'error');
        }
      } catch (err) {
        leaseLost = true;
        logInternal('alert_engine.lease_renew_failed', { owner_id: leaseOwner, message: err.message }, 'error');
      }
    }, LEASE_HEARTBEAT_MS);

    const rules = await listRules();
    const settings = getSettings();
    const globalCooldown = Number(settings.alerts.cooldown_seconds) || 0;
    const stateRows = await query('SELECT * FROM alert_state');
    const stateMap = new Map(stateRows.map(row => [row.rule_id, row]));

    for (const rule of rules) {
      if (leaseLost) break;
      if (!rule.enabled) continue;
      const stateRow = stateMap.get(rule.id);
      const lastEval = stateRow?.last_eval_at ? new Date(stateRow.last_eval_at) : null;
      const intervalSec = Number(rule.eval_interval_sec) || DEFAULT_EVAL_INTERVAL_SEC;
      if (lastEval && Date.now() - lastEval.getTime() < intervalSec * 1000) {
        continue;
      }
      try {
        await evaluateRule(rule, stateRow, globalCooldown);
      } catch (err) {
        logInternal('alert_engine.rule_failed', { rule_id: rule.id, message: err.message }, 'error');
      }
    }
  } finally {
    if (heartbeat) clearInterval(heartbeat);
    if (leaseOwner) {
      await releaseLease(leaseOwner);
    }
    evaluationInProgress = false;
  }
}

function startAlertEngine() {
  if (evaluatorInterval) return;
  evaluatorInterval = setInterval(() => {
    evaluateAlerts().catch(err => {
      logInternal('alert_engine.evaluate_failed', { message: err.message }, 'error');
    });
  }, DEFAULT_EVAL_INTERVAL_SEC * 1000);
  evaluateAlerts().catch(err => {
    logInternal('alert_engine.evaluate_failed', { message: err.message }, 'error');
  });
}

function stopAlertEngine() {
  if (evaluatorInterval) {
    clearInterval(evaluatorInterval);
    evaluatorInterval = null;
  }
}

module.exports = {
  listRules,
  upsertRule,
  deleteRule,
  listActiveAlerts,
  listResolvedAlerts,
  ackAlert,
  silenceAlert,
  startAlertEngine,
  stopAlertEngine,
  validateRulePayload,
  buildIncidentId,
  shouldAttemptIncidentNotify,
};
