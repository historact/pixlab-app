#!/usr/bin/env node
const assert = require('assert');
const Module = require('module');

const state = {
  usage: new Map(),
  requestLogs: [],
};

function usageKey(apiKeyId, period) {
  return `${apiKeyId}:${period}`;
}

function ensureUsage(apiKeyId, period) {
  const key = usageKey(apiKeyId, period);
  if (!state.usage.has(key)) {
    state.usage.set(key, {
      id: 1,
      api_key_id: apiKeyId,
      period,
      used_files: 0,
      used_bytes: 0,
      total_calls: 0,
      total_files_processed: 0,
      reserved_files: 0,
      h2i_calls: 0,
      h2i_files: 0,
      image_calls: 0,
      image_files: 0,
      pdf_calls: 0,
      pdf_files: 0,
      tools_calls: 0,
      tools_files: 0,
      bytes_in: 0,
      bytes_out: 0,
      errors: 0,
      last_error_code: null,
      last_error_message: null,
      last_request_at: null,
      created_at: new Date(),
      updated_at: new Date(),
    });
  }
  return state.usage.get(key);
}

function applyUsageUpdate(sql, params) {
  const apiKeyId = params[params.length - 2];
  const period = params[params.length - 1];
  const row = ensureUsage(apiKeyId, period);
  const setSql = sql.split('SET')[1].split('WHERE')[0];
  const fields = setSql.split(',').map(x => x.trim()).filter(Boolean);
  let i = 0;
  for (const f of fields) {
    if (f.includes('used_files = used_files + ?')) row.used_files += Number(params[i++]) || 0;
    else if (f.includes('used_bytes = used_bytes + ?')) row.used_bytes += Number(params[i++]) || 0;
    else if (f.includes('total_calls = total_calls + 1')) row.total_calls += 1;
    else if (f.includes('total_files_processed = total_files_processed + ?')) row.total_files_processed += Number(params[i++]) || 0;
    else if (f.includes('bytes_in = bytes_in + ?')) row.bytes_in += Number(params[i++]) || 0;
    else if (f.includes('bytes_out = bytes_out + ?')) row.bytes_out += Number(params[i++]) || 0;
    else if (f.includes('h2i_calls = h2i_calls + 1')) row.h2i_calls += 1;
    else if (f.includes('h2i_files = h2i_files + ?')) row.h2i_files += Number(params[i++]) || 0;
    else if (f.includes('errors = errors + 1')) row.errors += 1;
    else if (f.includes('last_error_code = ?')) row.last_error_code = params[i++] || null;
    else if (f.includes('last_error_message = ?')) row.last_error_message = params[i++] || null;
    else if (f.includes('last_request_at = NOW()') || f.includes('updated_at = NOW()')) {
      // no-op for test
    } else {
      throw new Error(`Unhandled update fragment: ${f}`);
    }
  }
}

const fakeDb = {
  query: async (sql, params = []) => {
    if (sql.includes('FROM usage_monthly')) {
      const row = state.usage.get(usageKey(params[0], params[1]));
      return row ? [row] : [];
    }
    return [];
  },
  pool: {
    execute: async (sql, params = []) => {
      if (sql.startsWith('INSERT INTO usage_monthly')) {
        ensureUsage(params[0], params[1]);
        return [{ insertId: 1 }];
      }
      if (sql.startsWith('UPDATE usage_monthly SET')) {
        applyUsageUpdate(sql, params);
        return [{ affectedRows: 1 }];
      }
      throw new Error(`Unhandled pool.execute SQL: ${sql}`);
    },
    getConnection: async () => ({
      beginTransaction: async () => {},
      rollback: async () => {},
      commit: async () => {},
      release: () => {},
      execute: async (sql, params = []) => {
        if (sql.startsWith('INSERT INTO request_log')) {
          const cols = sql.slice(sql.indexOf('(') + 1, sql.indexOf(')')).split(',').map(x => x.trim());
          const row = {};
          cols.forEach((c, idx) => { row[c] = params[idx]; });
          state.requestLogs.push(row);
          return [{ insertId: state.requestLogs.length }];
        }
        if (sql.startsWith('UPDATE usage_monthly SET')) {
          applyUsageUpdate(sql, params);
          return [{ affectedRows: 1 }];
        }
        throw new Error(`Unhandled conn.execute SQL: ${sql}`);
      },
    }),
  },
};

const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request.endsWith('/db') || request === './db') {
    return fakeDb;
  }
  if (request.endsWith('/utils/requestLog') || request === './utils/requestLog') {
    return {
      getRequestLogColumns: async () => [
        'api_key_id', 'request_id', 'timestamp', 'endpoint', 'action', 'status', 'ip', 'user_agent',
        'bytes_in', 'bytes_out', 'files_processed', 'error_code', 'error_message', 'params_json',
      ],
      insertRequestLogRow: async logRow => {
        state.requestLogs.push(logRow);
        return { inserted: true, insertId: state.requestLogs.length };
      },
    };
  }
  if (request.endsWith('/utils/logger') || request === './utils/logger') {
    return { logError: () => {}, logInfo: () => {} };
  }
  if (request.endsWith('/utils/config') || request === './utils/config') {
    return { getLedgerEnabled: () => false, getLedgerTtlSeconds: () => 3600 };
  }
  return originalLoad(request, parent, isMain);
};

const { recordUsageAndLog } = require('../usage');

(async () => {
  const apiKeyRecord = { id: 42, status: 'active', monthly_quota: 100, plan: { plan_slug: 'pro' } };
  const period = '2026-02';

  await recordUsageAndLog({
    apiKeyRecord,
    endpoint: 'h2i',
    action: 'html_to_image',
    filesReceived: 1,
    filesConsumed: 0,
    bytesIn: 100,
    bytesOut: 0,
    ok: false,
    errorCode: 'render_size_exceeded',
    errorMessage: 'Too many pixels',
    requestId: 'error-case-1',
    usagePeriod: period,
  });

  const afterError = state.usage.get(usageKey(42, period));
  assert(afterError, 'usage row should exist after error log');
  assert.equal(afterError.total_calls, 0, 'error should not increment total_calls');
  assert.equal(afterError.h2i_calls, 0, 'error should not increment endpoint calls');
  assert.equal(afterError.used_files, 0, 'error should not increment used_files');
  assert.equal(afterError.total_files_processed, 0, 'error should not increment total_files_processed');
  assert.equal(afterError.h2i_files, 0, 'error should not increment endpoint files');
  assert.equal(afterError.used_bytes, 0, 'error should not increment used_bytes');
  assert.equal(afterError.bytes_in, 0, 'error should not increment bytes_in');
  assert.equal(afterError.bytes_out, 0, 'error should not increment bytes_out');
  assert.equal(afterError.errors, 1, 'error counter should still increment');
  assert.equal(state.requestLogs[state.requestLogs.length - 1].status, 'error', 'error request_log should be preserved');

  await recordUsageAndLog({
    apiKeyRecord,
    endpoint: 'h2i',
    action: 'html_to_image',
    filesReceived: 1,
    filesConsumed: 1,
    bytesIn: 120,
    bytesOut: 256,
    ok: true,
    requestId: 'success-case-1',
    usagePeriod: period,
  });

  const afterSuccess = state.usage.get(usageKey(42, period));
  assert.equal(afterSuccess.total_calls, 1, 'success should increment total_calls');
  assert.equal(afterSuccess.h2i_calls, 1, 'success should increment endpoint calls');
  assert.equal(afterSuccess.used_files, 1, 'success should increment used_files');
  assert.equal(afterSuccess.total_files_processed, 1, 'success should increment total_files_processed');
  assert.equal(afterSuccess.h2i_files, 1, 'success should increment endpoint files');
  assert.equal(afterSuccess.used_bytes, 256, 'success should increment used_bytes');
  assert.equal(afterSuccess.bytes_in, 120, 'success should increment bytes_in');
  assert.equal(afterSuccess.bytes_out, 256, 'success should increment bytes_out');
  assert.equal(state.requestLogs[state.requestLogs.length - 1].status, 'success', 'success request_log should be preserved');

  console.log('test-no-bill-on-error: OK');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
