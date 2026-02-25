#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadModule(filePath, requireMap) {
  const code = fs.readFileSync(filePath, 'utf8');
  const module = { exports: {} };
  const sandbox = {
    module,
    exports: module.exports,
    __filename: filePath,
    __dirname: path.dirname(filePath),
    process,
    Buffer,
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    fetch: async () => { throw new Error('fetch not available in unit load'); },
    FormData: function FormData() {},
    Blob: function Blob() {},
    require: (request) => {
      if (Object.prototype.hasOwnProperty.call(requireMap, request)) {
        return requireMap[request];
      }
      throw new Error(`Unexpected require in test harness: ${request}`);
    },
  };
  vm.runInNewContext(code, sandbox, { filename: filePath });
  return module.exports;
}

const alertEngine = loadModule(
  path.join(__dirname, '..', 'utils', 'alertEngine.js'),
  {
    '../db': { query: async () => [], pool: {} },
    './logger': { getSettings: () => ({ alerts: { cooldown_seconds: 0 } }), logInternal: () => {} },
    './alerts': { sendAlert: async () => ({ ok: true, channelResults: [{ ok: true }] }) },
    './metrics': { getMetricsSnapshot: () => ({}), resolveMetricValueFromSnapshot: () => 0, endpoints: ['h2i', 'image', 'pdf', 'tools', 'health', 'internal', 'admin', 'other'] },
    './monitoringSnapshot': { buildSnapshotUrl: () => '', generateAlertSnapshot: async () => null },
  }
);

const alerts = loadModule(
  path.join(__dirname, '..', 'utils', 'alerts.js'),
  {
    fs,
    path,
    nodemailer: { createTransport: () => ({ sendMail: async () => ({ messageId: 'x', accepted: ['ok'], rejected: [] }) }) },
    './logger': { getSettings: () => ({ alerts: { cooldown_seconds: 0, email: {}, telegram: {} } }), sanitizeData: p => p, logInternal: () => {} },
  }
);

function testValidation() {
  const bad = alertEngine.validateRulePayload({
    name: 'x',
    metric_key: 'not_a_metric',
    operator: '><',
    threshold: Number.NaN,
    for_sec: -1,
    eval_interval_sec: 1,
    cooldown_sec: -3,
    severity: 'fatal',
    channels: { email: 'yes' },
  });
  assert.strictEqual(bad.ok, false, 'invalid rule should fail validation');
  const fields = bad.errors.map(e => e.field);
  assert(fields.includes('metric_key'));
  assert(fields.includes('operator'));
  assert(fields.includes('threshold'));

  const good = alertEngine.validateRulePayload({
    name: 'cpu high',
    metric_key: 'cpu_percent',
    operator: '>',
    threshold: 90,
    for_sec: 30,
    eval_interval_sec: 10,
    cooldown_sec: 60,
    severity: 'warn',
    enabled: true,
    channels: { email: true, telegram: false },
    scope: { endpoint: 'h2i' },
  });
  assert.strictEqual(good.ok, true, 'valid rule should pass validation');
}

function testDedupeKeys() {
  const incidentA = alertEngine.buildIncidentId(1, new Date('2026-01-01T00:00:00.000Z'));
  const incidentB = alertEngine.buildIncidentId(2, new Date('2026-01-01T00:00:00.000Z'));
  const keyA = alerts.buildAlertDedupeKey({ channel: 'runtime', level: 'warn', event: 'monitoring.alert.firing', rule_id: 1, incident_id: incidentA });
  const keyB = alerts.buildAlertDedupeKey({ channel: 'runtime', level: 'warn', event: 'monitoring.alert.firing', rule_id: 2, incident_id: incidentB });
  assert.notStrictEqual(keyA, keyB, 'different rules/incidents must not dedupe each other');
}

function testIncidentNotificationGate() {
  const incidentId = alertEngine.buildIncidentId(10, new Date('2026-01-01T00:00:00.000Z'));
  const fireStartAt = new Date('2026-01-01T00:00:00.000Z');
  assert.strictEqual(alertEngine.shouldAttemptIncidentNotify({}, incidentId, fireStartAt), true);
  assert.strictEqual(alertEngine.shouldAttemptIncidentNotify({
    incident_id: incidentId,
    last_notified_at: '2026-01-01 00:00:05',
  }, incidentId, fireStartAt), false);
  assert.strictEqual(alertEngine.shouldAttemptIncidentNotify({
    incident_id: incidentId,
    last_notified_at: '2025-12-31 23:59:30',
  }, incidentId, fireStartAt), true);
}

function main() {
  testValidation();
  testDedupeKeys();
  testIncidentNotificationGate();
  console.log('alert reliability assertions passed');
}

main();
