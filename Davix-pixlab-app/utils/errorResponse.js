const { attachRequestId } = require('./responseMeta');

function isSensitiveKey(key = '') {
  const normalized = key.toLowerCase();
  return (
    normalized === 'api_key' ||
    normalized === 'key' ||
    normalized === 'license_key' ||
    normalized === 'token' ||
    normalized === 'authorization' ||
    normalized === 'x-api-key' ||
    normalized === 'x_davix_bridge_token' ||
    normalized === 'x-davix-bridge-token' ||
    normalized === 'password' ||
    normalized === 'secret'
  );
}

function scrubString(value) {
  if (!value) return value;
  let scrubbed = value;
  scrubbed = scrubbed.replace(
    /(["']?\b(?:api_key|key|license_key|token|authorization|x-api-key|x-davix-bridge-token|x_davix_bridge_token|password|secret)\b["']?\s*[:=]\s*["']?)[^"'\s&}]+/gi,
    '$1[REDACTED]'
  );
  scrubbed = scrubbed.replace(
    /\b(?:api_key|key|license_key|token|authorization|x-api-key|x-davix-bridge-token|x_davix_bridge_token|password|secret)=([^&\s]+)/gi,
    (_match, val) => _match.replace(val, '[REDACTED]')
  );
  if (/(select|insert|update|delete|from|where)\s+/i.test(scrubbed)) {
    return '[REDACTED]';
  }
  if (/([A-Za-z]:\\|\/[^/\s]+\.(js|ts|sql|json|log|env|pem|key))/i.test(scrubbed)) {
    return '[REDACTED]';
  }
  return scrubbed;
}

function sanitizeDetails(value, depth = 0) {
  if (depth > 4) return '[REDACTED]';
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map(item => sanitizeDetails(item, depth + 1));
  }
  if (typeof value === 'string') return scrubString(value);
  if (typeof value !== 'object') return value;

  const output = {};
  for (const [key, val] of Object.entries(value)) {
    if (isSensitiveKey(key)) {
      output[key] = '[REDACTED]';
    } else {
      output[key] = sanitizeDetails(val, depth + 1);
    }
  }
  return output;
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

  if (statusCode >= 500) {
    const support = getSupportInfoFromEnv();
    if (support) {
      payload.error.support = support;
    }
  }

  return payload;
}

function sendError(res, statusCode, code, message, options = {}) {
  const payload = buildErrorPayload({
    statusCode,
    code,
    message,
    hint: options.hint,
    details: options.details,
  });

  res.status(statusCode).json(attachRequestId(res, payload));
}

module.exports = { sendError, buildErrorPayload, sanitizeDetails, getSupportInfoFromEnv };
