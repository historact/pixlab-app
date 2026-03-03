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
    plan: { quota_mode: 'monthly_total_only', monthly_total_limit: 100 },
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
    plan: { quota_mode: 'monthly_both', monthly_total_limit: 200, monthly_pdf_limit: 80 },
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
  console.log('verify-limits: OK');
}

run();
