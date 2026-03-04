const { attachRequestId } = require('./responseMeta');
const { redactObject, redactString } = require('./redaction');

function scrubString(value) {
  return redactString(value);
}

function sanitizeDetails(value, depth = 0) {
  if (depth > 4) return '[REDACTED]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return scrubString(value);
  if (typeof value !== 'object') return value;
  return redactObject(value, depth);
}

const USER_DETAIL_ALLOWLIST = new Set([
  'allowed',
  'received',
  'field',
  'limit',
  'used',
  'remaining',
  'period',
  'retry_after_seconds',
  'action',
  'endpoint',
  'plan_slug',
  'plan_name',
  'plan_price',
  'reason',
  'operation',
  'scope',
  'allowed_actions',
]);

const ENUM_ALLOWLIST = {
  reason: new Set([
    'request_validation_failed',
    'upload_validation_failed',
    'processing_failed',
    'database_operation_failed',
    'rate_limit_storage_unavailable',
    'timeout',
    'server_busy',
    'quota_exceeded',
  ]),
  operation: new Set([
    'upload_validation',
    'image_processing',
    'pdf_processing',
    'tools_processing',
    'html_render',
    'quota_check',
    'rate_limit',
    'request_validation',
    'subscription_event',
    'unhandled_error',
  ]),
  scope: new Set([
    'image_daily',
    'pdf_daily',
    'tools_daily',
    'h2i_daily',
    'tools_concurrency',
    'burst',
    'rate_limits_daily',
    'burst_limits_window',
  ]),
};

function sanitizeUserDetailsAllowlist(details, { strictAllowlist = true } = {}) {
  if (typeof details === 'undefined') return undefined;
  if (!strictAllowlist) return sanitizeDetails(details);
  if (!details || typeof details !== 'object' || Array.isArray(details)) return undefined;

  const output = {};
  for (const [key, rawValue] of Object.entries(details)) {
    if (!USER_DETAIL_ALLOWLIST.has(key)) continue;
    if (rawValue === undefined || rawValue === null) continue;

    if (key === 'allowed_actions') {
      if (!Array.isArray(rawValue)) continue;
      const list = rawValue.filter(item => typeof item === 'string').map(item => scrubString(item));
      if (list.length) output.allowed_actions = list;
      continue;
    }

    if (ENUM_ALLOWLIST[key]) {
      if (typeof rawValue !== 'string' || !ENUM_ALLOWLIST[key].has(rawValue)) continue;
      output[key] = rawValue;
      continue;
    }

    if (typeof rawValue === 'string') {
      output[key] = scrubString(rawValue);
      continue;
    }
    if (typeof rawValue === 'number' || typeof rawValue === 'boolean') {
      output[key] = rawValue;
    }
  }
  return Object.keys(output).length ? output : undefined;
}

function getSupportInfoFromEnv() {
  const email = (process.env.SUPPORT_EMAIL || '').trim();
  const url = (process.env.SUPPORT_URL || '').trim();
  const website = (process.env.WEBSITE_URL || '').trim();
  const support = {};
  if (email) support.email = email;
  if (url) support.url = url;
  if (website) support.website = website;
  return Object.keys(support).length ? support : null;
}

function getRenewalUrlFromEnv() {
  return (process.env.PIXLAB_RENEWAL_URL || '').trim();
}

function buildErrorPayload({ statusCode, code, message, hint, details } = {}) {
  const payload = {
    status: 'error',
    code,
    message,
    error: {
      code,
      message,
    },
  };

  if (hint) {
    payload.error.hint = hint;
  }

  if (typeof details !== 'undefined') {
    payload.error.details = sanitizeDetails(details);
  }

  if (code === 'key_expired') {
    const renewalUrl = getRenewalUrlFromEnv();
    if (renewalUrl) {
      payload.error.renewal_url = renewalUrl;
    }
  }

  if (statusCode >= 500) {
    const support = getSupportInfoFromEnv();
    if (support) {
      payload.error.support = support;
    }
  }

  return payload;
}

function sendError(res, statusCode, code, message, options = {}) {
  const reqPath = String(res?.req?.originalUrl || res?.req?.path || '');
  const strictAllowlist = reqPath.startsWith('/v1/');
  const safeDetails = sanitizeUserDetailsAllowlist(options.details, { strictAllowlist });
  const payload = buildErrorPayload({
    statusCode,
    code,
    message,
    hint: options.hint,
    details: safeDetails,
  });

  res.status(statusCode).json(attachRequestId(res, payload));
}

module.exports = { sendError, buildErrorPayload, sanitizeDetails, sanitizeUserDetailsAllowlist, getSupportInfoFromEnv };
