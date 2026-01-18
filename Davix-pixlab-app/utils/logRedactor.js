const path = require('path');

const SENSITIVE_KEY_REGEX = /(authorization|proxy-authorization|cookie|set-cookie|x-davix-bridge-token|x-api-key|api-key|x-api_token|token|secret|password|session|sid|api_key|x_api_key|session_id_hash)/i;
const SENSITIVE_QUERY_REGEX = /(token|key|secret|auth|signature|sig|session|sid|code)/i;

function maskValue(value) {
  if (value === null || value === undefined) return value;
  const str = String(value);
  if (!str) return str;
  if (str.length <= 9) return '[REDACTED]';
  return `${str.slice(0, 5)}***${str.slice(-4)}`;
}

function redactCookieString(_cookieHeader) {
  if (!_cookieHeader) return _cookieHeader;
  return '[REDACTED]';
}

function redactHeaders(headers = {}) {
  const redacted = {};
  for (const [key, value] of Object.entries(headers)) {
    if (SENSITIVE_KEY_REGEX.test(key)) {
      if (/cookie/i.test(key)) {
        redacted[key] = redactCookieString(value);
      } else {
        redacted[key] = maskValue(value);
      }
      continue;
    }
    redacted[key] = value;
  }
  return redacted;
}

function redactUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;
  try {
    const url = new URL(rawUrl);
    for (const [key, value] of url.searchParams.entries()) {
      if (SENSITIVE_QUERY_REGEX.test(key)) {
        url.searchParams.set(key, maskValue(value));
      }
    }
    return url.toString();
  } catch {
    return rawUrl;
  }
}

function redactPath(rawPath) {
  if (!rawPath || typeof rawPath !== 'string') return rawPath;
  if (path.isAbsolute(rawPath)) {
    return path.basename(rawPath);
  }
  return rawPath;
}

function redactObject(value, depth = 0) {
  if (depth > 6) return '[REDACTED]';
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map(item => redactObject(item, depth + 1));
  }
  if (typeof value === 'string') {
    if (/^https?:\/\//i.test(value)) {
      return redactUrl(value);
    }
    return value;
  }
  if (typeof value !== 'object') return value;

  const output = {};
  for (const [key, val] of Object.entries(value)) {
    if (key === 'headers') {
      output[key] = redactHeaders(val || {});
      continue;
    }
    if (SENSITIVE_KEY_REGEX.test(key)) {
      output[key] = maskValue(val);
      continue;
    }
    if (/cookie/i.test(key)) {
      output[key] = redactCookieString(val);
      continue;
    }
    if (/url|uri/i.test(key) && typeof val === 'string') {
      output[key] = redactUrl(val);
      continue;
    }
    if (/path|file|dir/i.test(key) && typeof val === 'string') {
      output[key] = redactPath(val);
      continue;
    }
    output[key] = redactObject(val, depth + 1);
  }
  return output;
}

module.exports = {
  maskValue,
  redactCookieString,
  redactHeaders,
  redactObject,
  redactPath,
  redactUrl,
};
