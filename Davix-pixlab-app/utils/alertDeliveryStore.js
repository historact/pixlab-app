const { query } = require('../db');
const { logInternal } = require('./logger');

const MAX_ERROR_LENGTH = 500;

function sanitizeErrorMessage(value) {
  const input = String(value || '');
  if (!input) return null;
  const redacted = input
    .replace(/\b\d{8,12}:[A-Za-z0-9_-]{20,}\b/g, '[REDACTED_TOKEN]')
    .replace(/(password|token|secret|authorization)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]');
  return redacted.slice(0, MAX_ERROR_LENGTH);
}

function boolToInt(value) {
  return value ? 1 : 0;
}

function normalizeRows({ ruleId, incidentId, eventType, notifyResult }) {
  const rows = [];
  const normalizedRuleId = Number.isFinite(Number(ruleId)) && Number(ruleId) > 0 ? Number(ruleId) : null;
  const channels = notifyResult?.channels && typeof notifyResult.channels === 'object'
    ? notifyResult.channels
    : {};

  for (const [channel, details] of Object.entries(channels)) {
    rows.push({
      rule_id: normalizedRuleId,
      incident_id: String(incidentId || 'unknown'),
      event_type: String(eventType || 'FIRING'),
      channel: String(channel || 'none'),
      ok: boolToInt(Boolean(details?.ok)),
      attempts: Number(details?.attempts) > 0 ? Number(details.attempts) : 1,
      duration_ms: Number.isFinite(Number(details?.duration_ms)) ? Number(details.duration_ms) : null,
      throttled: boolToInt(Boolean(notifyResult?.throttled || details?.throttled)),
      error_code: details?.error_code ? String(details.error_code).slice(0, 64) : null,
      error_message: sanitizeErrorMessage(details?.error_message || details?.error),
      provider_message_id: details?.provider_message_id ? String(details.provider_message_id).slice(0, 128) : null,
    });
  }

  if (!rows.length) {
    rows.push({
      rule_id: normalizedRuleId,
      incident_id: String(incidentId || 'unknown'),
      event_type: String(eventType || 'FIRING'),
      channel: 'none',
      ok: 0,
      attempts: 1,
      duration_ms: null,
      throttled: boolToInt(Boolean(notifyResult?.throttled)),
      error_code: notifyResult?.error ? String(notifyResult.error).toUpperCase().slice(0, 64) : 'NO_CHANNELS',
      error_message: sanitizeErrorMessage(notifyResult?.error || 'no_channels'),
      provider_message_id: null,
    });
  }

  return rows;
}

async function recordDeliveryOutcomes({ ruleId, incidentId, eventType, notifyResult }) {
  try {
    const rows = normalizeRows({ ruleId, incidentId, eventType, notifyResult });
    for (const item of rows) {
      await query(
        `INSERT INTO alert_deliveries
         (rule_id, incident_id, event_type, channel, ok, attempts, duration_ms, throttled, error_code, error_message, provider_message_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          item.rule_id,
          item.incident_id,
          item.event_type,
          item.channel,
          item.ok,
          item.attempts,
          item.duration_ms,
          item.throttled,
          item.error_code,
          item.error_message,
          item.provider_message_id,
        ]
      );
    }
  } catch (err) {
    logInternal('alert_delivery.persist_failed', {
      rule_id: ruleId,
      incident_id: incidentId,
      event_type: eventType,
      message: err?.message,
    }, 'error');
  }
}

module.exports = {
  recordDeliveryOutcomes,
  normalizeRows,
  sanitizeErrorMessage,
};
