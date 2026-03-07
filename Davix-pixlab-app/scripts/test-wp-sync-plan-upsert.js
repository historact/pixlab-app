#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadRouteTestables() {
  const filePath = path.join(__dirname, '..', 'routes', 'subscription-route.js');
  const code = fs.readFileSync(filePath, 'utf8');

  const sandbox = {
    module: { exports: {} },
    exports: {},
    process: { env: {} },
    console,
    require: (requestPath) => {
      if (requestPath === '../utils/errorResponse') return { sendError: () => {} };
      if (requestPath === '../utils/errorNormalizer') return { sendNormalizedError: () => {} };
      if (requestPath === '../utils/redaction') return { redactObject: () => ({}) };
      if (requestPath === '../utils/customerKeys') {
        return {
          activateOrProvisionKey: async () => ({}),
          ensureApiKeyForWpUser: async () => ({}),
          applySubscriptionStateChange: async () => ({}),
          disableCustomerKey: async () => ({}),
        };
      }
      if (requestPath === '../utils/apiKeys') return { generateApiKey: () => 'key' };
      if (requestPath === '../db') return { pool: { execute: async () => [[]] } };
      if (requestPath === '../utils/logger') return { logInternal: () => {}, getSubscriptionEventSettings: () => ({}) };
      if (requestPath === '../utils/requestInfo') return { extractClientInfo: () => ({}) };
      if (requestPath === '../utils/internalAuth') return { internalMiddleware: [], diagnosticsInternalMiddleware: [] };
      if (requestPath === '../utils/subscriptionEvents') {
        return {
          buildFallbackEventId: () => 'evt',
          insertSubscriptionEvent: async () => ({}),
          updateSubscriptionEventDecision: async () => ({}),
        };
      }
      if (requestPath === '../utils/time') {
        return {
          getValidFromGraceSeconds: () => 0,
          normalizeManualValidFrom: (d) => d,
          parseISO8601: () => ({ date: null, provided: false }),
          parseMysqlUtcDatetime: () => null,
          utcNow: () => new Date(),
        };
      }
      if (requestPath === '../usage') {
        return {
          getCalendarPeriodUTC: () => ({}),
          getCyclePeriodKeyFromBounds: () => '',
          getUsagePeriodForKey: () => ({}),
          getValidityBoundsUTC: () => ({}),
        };
      }
      if (requestPath === '../utils/config') return { isDiagnosticsEnabled: () => false };
      if (requestPath === '../utils/responseMeta') return { attachRequestId: (_req, payload) => payload };
      throw new Error(`Unexpected require in test loader: ${requestPath}`);
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: filePath });

  if (!sandbox.module.exports.__testables) {
    throw new Error('Expected __testables export in subscription-route.js');
  }
  return sandbox.module.exports.__testables;
}

const { buildPlanSyncUpsert } = loadRouteTestables();

function runMinimalPayloadTest() {
  const payload = {
    plan_slug: ' legacy-basic ',
    name: 'Legacy Basic',
    allow_h2i: '1',
  };

  const result = buildPlanSyncUpsert(payload, { includeMaxDimension: true });

  assert.equal(result.planSlug, 'legacy-basic');
  assert.deepEqual(Array.from(result.columns), ['plan_slug', 'name', 'allow_h2i']);
  assert.deepEqual(Array.from(result.values), ['legacy-basic', 'Legacy Basic', 1]);
  assert.match(result.setClause, /name = VALUES\(name\)/);
  assert.match(result.setClause, /allow_h2i = VALUES\(allow_h2i\)/);
}

function runFullPayloadTest() {
  const payload = {
    plan_slug: 'pro-max',
    name: 'Pro Max',
    billing_period: 'monthly',
    monthly_quota_files: '5000',
    max_files_per_request: '40',
    max_total_upload_mb: '250',
    max_dimension_px: '12000',
    timeout_seconds: '180',
    allow_h2i: true,
    allow_image: '1',
    allow_pdf: 'true',
    allow_tools: 1,
    is_free: '0',
    description: 'all limits enabled',
    max_upload_bytes_per_file: '10485760',
    h2i_enabled: '1',
    h2i_max_html_chars: '700000',
    h2i_max_render_width: '5000',
    h2i_max_render_height: '5000',
    h2i_max_render_pixels: '20000000',
    image_enabled: 'true',
    image_max_dimension_px: '8000',
    image_max_total_upload_mb: '300',
    image_max_files_per_request: '60',
    pdf_enabled: 1,
    pdf_max_total_upload_mb: 350,
    pdf_max_files_per_request: 80,
    pdf_max_pages_to_images: 120,
    pdf_max_pages_extract_images: 120,
    pdf_max_pages_split: 240,
    tools_enabled: '1',
    tools_max_dimension_px: '9000',
    tools_max_total_upload_mb: 275,
    tools_max_files_per_request: 44,
    quota_mode: 'monthly_both',
    monthly_h2i_limit: 1000,
    monthly_image_limit: 1000,
    monthly_pdf_limit: 1000,
    monthly_tools_limit: 1000,
    burst_limit_per_min: 300,
    burst_window_seconds: 60,
    burst_applies_to: 'all',
    unknown_field: 'ignored',
  };

  const result = buildPlanSyncUpsert(payload, { includeMaxDimension: true });

  assert.equal(result.planSlug, 'pro-max');
  assert.equal(result.columns.includes('unknown_field'), false);
  assert.equal(result.columns.includes('quota_mode'), true);
  assert.equal(result.columns.includes('burst_applies_to'), true);
  assert.equal(result.columns.includes('timeout_ms'), false);
  assert.equal(result.values[result.columns.indexOf('allow_pdf')], 1);
  assert.equal(result.values[result.columns.indexOf('is_free')], 0);
  assert.equal(result.values[result.columns.indexOf('timeout_seconds')], 180);
  assert.equal(result.values[result.columns.indexOf('quota_mode')], 'monthly_both');
  assert.equal(result.values[result.columns.indexOf('burst_applies_to')], 'all');
}

function runTimeoutMsIgnoredTest() {
  const payload = {
    plan_slug: 'pro-max',
    timeout_ms: '180000',
  };
  const result = buildPlanSyncUpsert(payload, { includeMaxDimension: true });

  assert.equal(result.columns.includes('timeout_ms'), false);
  assert.equal(result.columns.includes('timeout_seconds'), false);
}

runMinimalPayloadTest();
runFullPayloadTest();
runTimeoutMsIgnoredTest();

console.log('ok: wp-sync plan upsert compatibility + timeout_seconds-only timeout contract');
