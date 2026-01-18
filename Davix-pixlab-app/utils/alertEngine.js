const fs = require('fs');
const { query, pool } = require('../db');
const { getSettings, logInternal } = require('./logger');
const { sendAlert } = require('./alerts');
const { getMetricsSnapshot, resolveMetricValueFromSnapshot } = require('./metrics');
const { buildSnapshotUrl, generateAlertSnapshot } = require('./monitoringSnapshot');

const OWNER_ID = `alert-engine-${process.pid}`;
const DEFAULT_EVAL_INTERVAL_SEC = 10;
const LOCK_NAME = 'alert_engine';

let evaluatorInterval = null;

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

async function listRules() {
  const rows = await query('SELECT * FROM alert_rules ORDER BY id DESC');
  return rows.map(normalizeRule);
}

async function upsertRule(payload) {
  const scopeJson = JSON.stringify(payload.scope || {});
  const channelsJson = JSON.stringify(payload.channels || {});
  if (payload.id) {
    await query(
      `UPDATE alert_rules
       SET name = ?, enabled = ?, metric_key = ?, scope_json = ?, operator = ?, threshold = ?,
           for_sec = ?, eval_interval_sec = ?, cooldown_sec = ?, severity = ?, channels_json = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        payload.name,
        payload.enabled ? 1 : 0,
        payload.metric_key,
        scopeJson,
        payload.operator,
        payload.threshold,
        payload.for_sec,
        payload.eval_interval_sec || DEFAULT_EVAL_INTERVAL_SEC,
        payload.cooldown_sec || 0,
        payload.severity || 'info',
        channelsJson,
        payload.id,
      ]
    );
    return payload.id;
  }

  const result = await query(
    `INSERT INTO alert_rules
       (name, enabled, metric_key, scope_json, operator, threshold, for_sec, eval_interval_sec, cooldown_sec, severity, channels_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.name,
      payload.enabled ? 1 : 0,
      payload.metric_key,
      scopeJson,
      payload.operator,
      payload.threshold,
      payload.for_sec,
      payload.eval_interval_sec || DEFAULT_EVAL_INTERVAL_SEC,
      payload.cooldown_sec || 0,
      payload.severity || 'info',
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
      'SELECT lease_until FROM lease_locks WHERE name = ? FOR UPDATE',
      [LOCK_NAME]
    );
    const now = new Date();
    const leaseUntil = rows?.[0]?.lease_until ? new Date(rows[0].lease_until) : null;
    if (leaseUntil && leaseUntil > now) {
      await conn.rollback();
      return false;
    }
    await conn.query(
      `INSERT INTO lease_locks (name, owner_id, lease_until)
       VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 30 SECOND))
       ON DUPLICATE KEY UPDATE owner_id = VALUES(owner_id), lease_until = VALUES(lease_until)`,
      [LOCK_NAME, OWNER_ID]
    );
    await conn.commit();
    return true;
  } catch (err) {
    await conn.rollback();
    logInternal('alert_engine.lease_failed', { message: err.message }, 'warn');
    return false;
  } finally {
    conn.release();
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

  if (shouldFire && state !== 'FIRING') {
    const message = buildAlertMessage(rule, value);
    const endpoint = rule.scope?.endpoint || '';
    const endpointStats = endpoint ? snapshot.endpoints?.[endpoint] : null;
    const queueStats = endpoint ? snapshot.queues?.[endpoint] : null;
    const sinceTime = pendingSince || now;
    const cooldownSec = Math.max(globalCooldown, Number(rule.cooldown_sec) || 0);
    const lastFire = stateRow?.last_fire_at ? new Date(stateRow.last_fire_at) : null;
    const onCooldown = lastFire && now - lastFire < cooldownSec * 1000;
    const silenceUntil = stateRow?.silence_until ? new Date(stateRow.silence_until) : null;
    const ackUntil = stateRow?.ack_until ? new Date(stateRow.ack_until) : null;
    const suppressed = (silenceUntil && silenceUntil > now) || (ackUntil && ackUntil > now);
    const snapshotViewUrl = buildSnapshotUrl(rule.id, { view: true });
    const snapshotImageUrl = buildSnapshotUrl(rule.id, { view: false });
    logInternal('snapshot.url.built', {
      rule_id: rule.id,
      snapshot_view_url: snapshotViewUrl,
      snapshot_image_url: snapshotImageUrl,
      request_id: null,
    });

    let snapshotPath = null;
    try {
      snapshotPath = await generateAlertSnapshot(rule.id);
      if (snapshotPath) {
        const stats = await fs.promises.stat(snapshotPath);
        logInternal('alert_engine.snapshot_ready', {
          rule_id: rule.id,
          bytes: stats.size,
          path: snapshotPath,
        });
      }
    } catch (err) {
      logInternal('alert_engine.snapshot_failed', { rule_id: rule.id, message: err.message }, 'warn');
    }
    if (!snapshotPath) {
      logInternal('alert_engine.snapshot_missing', {
        rule_id: rule.id,
        snapshot_url: snapshotImageUrl,
      }, 'warn');
    }

    await upsertState(rule.id, {
      state: 'FIRING',
      last_change_at: now,
      last_fire_at: now,
      pending_since: null,
      last_eval_at: now,
      last_value: value,
      last_snapshot_path: snapshotPath,
      last_message: message,
    });
    const alertEventId = await recordEvent(rule.id, 'FIRING', value, message);
    logInternal('alert.fired', {
      alert_id: alertEventId,
      rule_id: rule.id,
      fired_at: now.toISOString(),
      request_id: null,
    });

    if (!onCooldown && !suppressed) {
      await sendAlert(
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
          fired_at: now.toISOString(),
          since: sinceTime.toISOString(),
          metric: rule.metric_key,
          operator: rule.operator,
          threshold: rule.threshold,
          value,
          snapshot_url: snapshotViewUrl,
          snapshot_view_url: snapshotViewUrl,
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
          attachments: snapshotPath
            ? [{ filename: 'monitoring.png', path: snapshotPath, contentType: 'image/png' }]
            : [],
          telegramPhoto: snapshotPath ? { path: snapshotPath, caption: message } : null,
          channelsOverride: rule.channels || null,
        }
      );
    }
    return;
  }

  if (state === 'FIRING') {
    await upsertState(rule.id, {
      last_eval_at: now,
      last_value: value,
    });
  } else {
    await upsertState(rule.id, {
      last_eval_at: now,
      last_value: value,
    });
  }
}

async function evaluateAlerts() {
  const hasLease = await acquireLease();
  if (!hasLease) return;
  const rules = await listRules();
  const settings = getSettings();
  const globalCooldown = Number(settings.alerts.cooldown_seconds) || 0;
  const stateRows = await query('SELECT * FROM alert_state');
  const stateMap = new Map(stateRows.map(row => [row.rule_id, row]));

  for (const rule of rules) {
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
};
