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
