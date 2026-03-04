#!/usr/bin/env node
const assert = require('assert');
const Module = require('module');

const dbState = {
  apiKeysByPrefix: new Map(),
  usageByKeyPeriod: new Map(),
};

function usageKey(apiKeyId, period) {
  return `${apiKeyId}:${period}`;
}

const fakeDb = {
  query: async (sql, params = []) => {
    if (sql.includes('FROM api_keys ak')) {
      const prefix = params[0];
      const row = dbState.apiKeysByPrefix.get(prefix);
      return row ? [row] : [];
    }
    if (sql.includes('FROM plans WHERE plan_slug = ?')) {
      return [];
    }
    if (sql.includes('FROM usage_monthly')) {
      const k = usageKey(params[0], params[1]);
      const row = dbState.usageByKeyPeriod.get(k);
      return row ? [row] : [];
    }
    return [];
  },
  pool: {
    execute: async (sql, params = []) => {
      if (sql.startsWith('INSERT INTO usage_monthly')) {
        const k = usageKey(params[0], params[1]);
        if (!dbState.usageByKeyPeriod.has(k)) {
          dbState.usageByKeyPeriod.set(k, {
            id: 1,
            period: params[1],
            used_files: 0,
            reserved_files: 0,
            used_bytes: 0,
            total_calls: 0,
            total_files_processed: 0,
            h2i_files: 0,
            image_files: 0,
            pdf_files: 0,
            tools_files: 0,
          });
        }
        return [{ insertId: 1 }];
      }
      if (sql.startsWith('UPDATE usage_monthly')) {
        const reserveCount = params[0];
        const apiKeyId = params[1];
        const period = params[2];
        const k = usageKey(apiKeyId, period);
        const row = dbState.usageByKeyPeriod.get(k);
        if (!row) return [{ affectedRows: 0 }];
        const limit = params[4];
        const next = (row.used_files || 0) + (row.reserved_files || 0) + reserveCount;
        if (Number.isFinite(limit) && next > limit) {
          return [{ affectedRows: 0 }];
        }
        row.reserved_files = (row.reserved_files || 0) + reserveCount;
        dbState.usageByKeyPeriod.set(k, row);
        return [{ affectedRows: 1 }];
      }
      return [{}];
    },
  },
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request.endsWith('/db') || request === '../db' || request === './db') {
    return fakeDb;
  }
  if (request === 'multer') {
    return () => ({ fields: () => (req, res, next) => next(), any: () => (req, res, next) => next() });
  }
  if (request === 'sharp') {
    const stub = () => ({ metadata: async () => ({ width: 1, height: 1 }) });
    stub.cache = () => {};
    stub.concurrency = () => {};
    return stub;
  }
  if (request.endsWith('/apiKeys') || request === './apiKeys') {
    return {
      extractKeyPrefix: key => String(key).split('_').slice(0, 2).join('_'),
      verifyApiKeyHash: async () => true,
      generateApiKey: () => 'x',
      hashApiKey: async () => 'h',
    };
  }
  return originalLoad(request, parent, isMain);
};

const { findCustomerKeyByPlaintext } = require('../utils/customerKeys');
const { validatePlanLimits } = require('../utils/limits');
const { mapMulterError } = require('../utils/uploadLimits');
const { reserveQuota } = require('../usage');

function makeRes() {
  const out = { statusCode: null, body: null };
  return {
    status(code) {
      out.statusCode = code;
      return { json(payload) { out.body = payload; } };
    },
    setHeader() {},
    get _out() { return out; },
  };
}

(async () => {
  dbState.apiKeysByPrefix.set('pk_live', {
    id: 9,
    key_prefix: 'pk_live',
    key_hash: 'hash',
    status: 'active',
    plan_id: 1,
    plan_slug: 'pro',
    joined_plan_id: 1,
    monthly_quota: 10,
    allow_tools: 1,
  });

  const found = await findCustomerKeyByPlaintext('pk_live_secret_1234');
  assert(found.key && found.key.id === 9, 'API key should resolve and authenticate');

  const reqDisabled = {
    apiKeyType: 'customer',
    customerKey: { plan: { plan_slug: 'basic', allow_tools: 0 } },
  };
  const resDisabled = makeRes();
  let disabledNext = false;
  validatePlanLimits('tools')(reqDisabled, resDisabled, () => { disabledNext = true; });
  assert(!disabledNext && resDisabled._out.statusCode === 403, 'Disabled tool should fail with 403');

  const reqFileCount = {
    requestId: 't1',
    originalUrl: '/v1/image',
    path: '/v1/image',
  };
  const resFileCount = makeRes();
  mapMulterError({ code: 'LIMIT_FILE_COUNT' }, reqFileCount, resFileCount, { maxFiles: 1, maxTotalUploadMb: 5, perFileLimitBytes: 1024 }, 'image', [{ name: 'images' }]);
  assert(resFileCount._out.statusCode === 413, 'Too many files should fail');

  const reqLarge = { requestId: 't2', originalUrl: '/v1/tools', path: '/v1/tools' };
  const resLarge = makeRes();
  mapMulterError({ code: 'LIMIT_FILE_SIZE', field: 'images' }, reqLarge, resLarge, { maxFiles: 5, maxTotalUploadMb: 5, perFileLimitBytes: 100 }, 'tools', [{ name: 'images' }]);
  assert(resLarge._out.statusCode === 413, 'Large upload should be rejected');

  dbState.usageByKeyPeriod.set('9:2026-01', { id: 1, period: '2026-01', used_files: 10, reserved_files: 0 });
  const quota = await reserveQuota({
    apiKeyId: 9,
    period: '2026-01',
    filesToReserve: 1,
    monthlyQuota: 10,
    plan: { quota_mode: 'monthly_total_only', monthly_quota_files: 10 },
    endpoint: 'image',
  });
  assert(quota.allowed === false, 'Monthly quota exceeded should be denied');

  console.log('test-plan-auth-and-limits: OK');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
