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

async function main() {
  const inserts = [];
  const store = loadModule(
    path.join(__dirname, '..', 'utils', 'alertDeliveryStore.js'),
    {
      '../db': {
        query: async (sql, params) => {
          if (String(sql).includes('INSERT INTO alert_deliveries')) {
            inserts.push(params);
          }
          return [];
        },
      },
      './logger': { logInternal: () => {} },
    }
  );

  const notifyResult = {
    ok: false,
    throttled: false,
    channels: {
      email: {
        ok: false,
        attempts: 3,
        duration_ms: 1001,
        error_code: 'email_send_failed',
        error_message: 'smtp timeout token=123456789:SECRET_SECRET_SECRET_SECRET',
        provider_message_id: null,
      },
      telegram: {
        ok: true,
        attempts: 1,
        duration_ms: 240,
        error_code: null,
        error_message: null,
        provider_message_id: '999',
      },
    },
  };

  await store.recordDeliveryOutcomes({
    ruleId: 42,
    incidentId: '42:2026-01-01T00:00:00.000Z',
    eventType: 'FIRING',
    notifyResult,
  });

  assert.strictEqual(inserts.length, 2, 'expected one row per channel');
  const emailInsert = inserts.find(row => row[3] === 'email');
  const telegramInsert = inserts.find(row => row[3] === 'telegram');

  assert(emailInsert, 'email row missing');
  assert(telegramInsert, 'telegram row missing');
  assert.strictEqual(emailInsert[4], 0, 'email ok should be 0');
  assert.strictEqual(emailInsert[5], 3, 'email attempts should persist');
  assert.strictEqual(telegramInsert[4], 1, 'telegram ok should be 1');
  assert.strictEqual(telegramInsert[10], '999', 'provider message id should persist');
  assert(!String(emailInsert[9]).includes('SECRET_SECRET'), 'error message should redact token-ish values');

  const fallbackRows = store.normalizeRows({
    ruleId: null,
    incidentId: 'test:1',
    eventType: 'TEST',
    notifyResult: { ok: false, error: 'no_channels', channels: {} },
  });
  assert.strictEqual(fallbackRows.length, 1, 'expected fallback none row');
  assert.strictEqual(fallbackRows[0].channel, 'none');
  assert.strictEqual(fallbackRows[0].ok, 0);
  assert.strictEqual(store.mapDeliveryStatus(1), 'Sent', 'status should map ok=1 to Sent');
  assert.strictEqual(store.mapDeliveryStatus(0), 'Failed', 'status should map ok=0 to Failed');

  console.log('alert delivery persistence assertions passed');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
