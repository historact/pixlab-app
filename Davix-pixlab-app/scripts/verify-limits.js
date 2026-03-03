#!/usr/bin/env node
const Module = require('module');
const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'mysql2/promise') {
    return {
      createPool: () => ({
        execute: async () => [[]],
        query: async () => [[]],
        getConnection: async () => ({
          query: async () => [[]],
          execute: async () => [[]],
          beginTransaction: async () => {},
          commit: async () => {},
          rollback: async () => {},
          release: () => {},
        }),
      }),
    };
  }
  return originalLoad(request, parent, isMain);
};
const assert = require('assert');
const {
  resolveH2iRenderLimits,
  resolveRequestLimits,
  resolvePdfPageLimits,
} = require('../utils/limits');
const { resolveQuotaPolicy } = require('../usage');
const { validateEnv } = require('../utils/validateEnv');
const { withinValidityWindow } = require('../utils/customerKeys');
const { parseTrustProxySetting } = require('../utils/config');
const fs = require('fs');

function withEnv(overrides, fn) {
  const prev = {};
  for (const [k, v] of Object.entries(overrides)) {
    prev[k] = process.env[k];
    if (v === null || v === undefined) delete process.env[k];
    else process.env[k] = String(v);
  }
  try {
    fn();
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

function testPublicH2iLimit() {
  withEnv({ PUBLIC_H2I_MAX_HTML_CHARS: '1234', GLOBAL_MAX_HTML_CHARS: '9999' }, () => {
    const req = { apiKeyType: 'public', customerKey: null };
    const limits = resolveH2iRenderLimits(req);
    assert.strictEqual(limits.maxHtmlChars, 1234, 'public should use PUBLIC_H2I_MAX_HTML_CHARS');
  });
}

function testCustomerH2iLimit() {
  withEnv({ PUBLIC_H2I_MAX_HTML_CHARS: '1234', GLOBAL_MAX_HTML_CHARS: '9999' }, () => {
    const req = {
      apiKeyType: 'customer',
      customerKey: { plan: { h2i_max_html_chars: 4321 } },
    };
    const limits = resolveH2iRenderLimits(req);
    assert.strictEqual(limits.maxHtmlChars, 4321, 'customer should use plan.h2i_max_html_chars');
  });
}


function testPublicH2iClampedByGlobal() {
  withEnv({ PUBLIC_H2I_MAX_HTML_CHARS: '120000', GLOBAL_MAX_HTML_CHARS: '90000' }, () => {
    const req = { apiKeyType: 'public', customerKey: null };
    const limits = resolveH2iRenderLimits(req);
    assert.strictEqual(limits.maxHtmlChars, 90000, 'public h2i limit should be clamped by GLOBAL_MAX_HTML_CHARS');
  });
}

function testCustomerH2iClampedByGlobal() {
  withEnv({ GLOBAL_MAX_HTML_CHARS: '90000' }, () => {
    const req = {
      apiKeyType: 'customer',
      customerKey: { plan: { h2i_max_html_chars: 120000 } },
    };
    const limits = resolveH2iRenderLimits(req);
    assert.strictEqual(limits.maxHtmlChars, 90000, 'customer h2i plan limit should be clamped by GLOBAL_MAX_HTML_CHARS');
  });
}

function testCustomerNoPublicFallbackUpload() {
  withEnv({ PUBLIC_IMAGE_MAX_FILES_PER_REQ: '3' }, () => {
    const req = {
      apiKeyType: 'customer',
      customerKey: {
        plan: {
          max_files_per_request: 17,
          max_total_upload_mb: 22,
          max_dimension_px: 4500,
        },
      },
    };
    const resolved = resolveRequestLimits(req, 'image');
    assert.strictEqual(resolved.upload.maxFiles, 17, 'customer should not use public image max files');
  });
}

function testQuotaModePolicies() {
  const totalOnly = resolveQuotaPolicy({
    plan: { quota_mode: 'monthly_total_only', monthly_quota_files: 100 },
    endpoint: 'h2i',
  });
  assert.strictEqual(totalOnly.enforceTotal, true);
  assert.strictEqual(totalOnly.enforceScoped, false);

  const scopedOnly = resolveQuotaPolicy({
    plan: { quota_mode: 'monthly_scoped_only', monthly_h2i_limit: 50 },
    endpoint: 'h2i',
  });
  assert.strictEqual(scopedOnly.enforceTotal, false);
  assert.strictEqual(scopedOnly.enforceScoped, true);

  const both = resolveQuotaPolicy({
    plan: { quota_mode: 'monthly_both', monthly_quota_files: 200, monthly_pdf_limit: 80 },
    endpoint: 'pdf',
  });
  assert.strictEqual(both.enforceTotal, true);
  assert.strictEqual(both.enforceScoped, true);

  const legacy = resolveQuotaPolicy({
    plan: { monthly_quota_files: 77 },
    endpoint: 'tools',
  });
  assert.strictEqual(legacy.mode, 'monthly_total_only');
  assert.strictEqual(legacy.totalLimit, 77);
}

function testPublicPdfPageOverrides() {
  withEnv(
    {
      GLOBAL_PDF_MAX_PAGES_TO_IMAGES: '50',
      PUBLIC_PDF_MAX_PAGES_TO_IMAGES: '11',
      PUBLIC_PDF_MAX_PAGES_EXTRACT_IMAGES: '12',
      PUBLIC_PDF_MAX_PAGES_SPLIT: '13',
    },
    () => {
      const req = { apiKeyType: 'public', customerKey: null };
      const limits = resolvePdfPageLimits(req);
      assert.strictEqual(limits.toImages, 11);
      assert.strictEqual(limits.extractImages, 12);
      assert.strictEqual(limits.split, 13);
    }
  );
}


function testPublicTimeoutsArePerEndpointOnly() {
  withEnv(
    {
      PUBLIC_H2I_TIMEOUT_MS: '11000',
      PUBLIC_IMAGE_TIMEOUT_MS: '12000',
      PUBLIC_PDF_TIMEOUT_MS: '13000',
      PUBLIC_TOOLS_TIMEOUT_MS: '14000',
    },
    () => {
      const req = { apiKeyType: 'public', customerKey: null };
      assert.strictEqual(resolveRequestLimits({ ...req }, 'h2i').timeoutMs, 11000);
      assert.strictEqual(resolveRequestLimits({ ...req }, 'image').timeoutMs, 12000);
      assert.strictEqual(resolveRequestLimits({ ...req }, 'pdf').timeoutMs, 13000);
      assert.strictEqual(resolveRequestLimits({ ...req }, 'tools').timeoutMs, 14000);
    }
  );
}

function testCustomerPdfPageLimitClampedByGlobal() {
  withEnv({ GLOBAL_PDF_MAX_PAGES_TO_IMAGES: '50' }, () => {
    const req = {
      apiKeyType: 'customer',
      customerKey: { plan: { pdf_max_pages_to_images: 80 } },
    };
    const limits = resolvePdfPageLimits(req);
    assert.strictEqual(limits.toImages, 50, 'customer pdf page limit should be clamped by global cap');
  });
}

function testCustomerUploadPerFileClampedByGlobal() {
  withEnv({ GLOBAL_MAX_UPLOAD_BYTES: String(8 * 1024 * 1024) }, () => {
    const req = {
      apiKeyType: 'customer',
      customerKey: { plan: { max_upload_bytes_per_file: 15 * 1024 * 1024 } },
    };
    const limits = resolveRequestLimits(req, 'image');
    assert.strictEqual(limits.upload.perFileLimitBytes, 8 * 1024 * 1024, 'customer per-file upload should be clamped by GLOBAL_MAX_UPLOAD_BYTES');
  });
}


function testProductionRequiresTrustProxy() {
  withEnv({ NODE_ENV: 'production', TRUST_PROXY: null }, () => {
    const { errors } = validateEnv();
    assert(errors.some(err => err.includes('TRUST_PROXY')), 'production must require TRUST_PROXY');
  });
  withEnv({ NODE_ENV: 'production', TRUST_PROXY: '1' }, () => {
    const { errors } = validateEnv();
    assert(!errors.some(err => err.includes('TRUST_PROXY')), 'valid TRUST_PROXY should pass validation');
    assert.strictEqual(parseTrustProxySetting(), 1);
  });
}

function testValidityGraceWindow() {
  const now = Date.now();
  withEnv({ VALID_FROM_GRACE_SECONDS: '60' }, () => {
    const validFrom = new Date(now + 30 * 1000).toISOString().slice(0, 19).replace('T', ' ');
    const result = withinValidityWindow({ valid_from: validFrom, valid_until: null });
    assert.strictEqual(result.ok, true, 'valid_from within grace should pass request-time validation');
  });
}

function testApiKeysRetentionCleanupSqlPolicy() {
  const file = fs.readFileSync(require.resolve('../utils/apiKeysRetentionCleanup'), 'utf8');
  assert(file.includes("subscription_status = ?"), 'retention cleanup should filter by subscription_status');
  assert(file.includes("status = ?"), 'retention cleanup should filter by status');
  assert(file.includes("valid_until IS NOT NULL"), 'retention cleanup should require non-null valid_until');
  assert(file.includes("valid_until < (UTC_TIMESTAMP() - INTERVAL ? DAY)"), 'retention cleanup should use retention-days interval');
}

function testRequestAuthPlanResolutionFailClosedPolicy() {
  const customerKeysFile = fs.readFileSync(require.resolve('../utils/customerKeys'), 'utf8');
  const serverFile = fs.readFileSync(require.resolve('../server'), 'utf8');

  assert(
    customerKeysFile.includes("error: 'plan_resolution_failed'"),
    'request-time customer key lookup should fail closed with plan_resolution_failed'
  );
  assert(
    !customerKeysFile.includes('plan.fallback_free.failed'),
    'request-time customer key lookup should not include free-plan fallback path'
  );
  assert(
    !customerKeysFile.includes("UPDATE api_keys SET plan_id = ? WHERE id = ? LIMIT 1"),
    'request-time customer key lookup should not self-heal api_keys.plan_id'
  );
  assert(
    serverFile.includes("if (customerKeyError === 'plan_resolution_failed')"),
    'request auth middleware should map plan_resolution_failed to explicit API error response'
  );
}

function testRequestAuthHasNoExpiredKeySelfHealWrite() {
  const serverFile = fs.readFileSync(require.resolve('../server'), 'utf8');
  assert(
    !serverFile.includes('Expired key self-heal failed:'),
    'request auth should not include expired-key self-heal branch'
  );
  assert(
    !serverFile.includes("api_key.expired_self_heal_failed"),
    'request auth should not emit expired-key self-heal logs'
  );
  assert(
    !serverFile.includes("SET status = ?, subscription_status = ?, updated_at = NOW()"),
    'request auth should not update api_keys rows in expired-key handling'
  );
}

function run() {
  testPublicH2iLimit();
  testCustomerH2iLimit();
  testPublicH2iClampedByGlobal();
  testCustomerH2iClampedByGlobal();
  testCustomerNoPublicFallbackUpload();
  testQuotaModePolicies();
  testPublicPdfPageOverrides();
  testCustomerPdfPageLimitClampedByGlobal();
  testCustomerUploadPerFileClampedByGlobal();
  testPublicTimeoutsArePerEndpointOnly();
  testProductionRequiresTrustProxy();
  testValidityGraceWindow();
  testApiKeysRetentionCleanupSqlPolicy();
  testRequestAuthPlanResolutionFailClosedPolicy();
  testRequestAuthHasNoExpiredKeySelfHealWrite();
  console.log('verify-limits: OK');
}

run();
