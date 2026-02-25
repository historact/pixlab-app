const SENSITIVE_KEY_PATTERNS = [
  'apikey',
  'api_key',
  'x-api-key',
  'x_api_key',
  'authorization',
  'bearer',
  'token',
  'access_token',
  'refresh_token',
  'secret',
  'password',
  'cookie',
  'set-cookie',
  'session',
  'jwt',
  'csrf',
  'license_key',
  'x_davix_bridge_token',
  'x-davix-bridge-token',
];

function normalizeKey(key = '') {
  return String(key)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function isSensitiveKey(key = '') {
  const normalized = normalizeKey(key);
  return SENSITIVE_KEY_PATTERNS.some(pattern => normalized.includes(pattern.replace(/[^a-z0-9]/g, '')));
}

function redactString(value) {
  if (typeof value !== 'string' || !value) return value;
  let scrubbed = value;
  scrubbed = scrubbed.replace(
    /(["']?\b(?:api[_-]?key|key|license[_-]?key|token|authorization|bearer|access[_-]?token|refresh[_-]?token|x[_-]?davix[_-]?bridge[_-]?token|password|secret|cookie|set-cookie|session|jwt|csrf)\b["']?\s*[:=]\s*["']?)[^"'\s&}]+/gi,
    '$1[REDACTED]'
  );
  scrubbed = scrubbed.replace(
    /\b(?:api[_-]?key|key|license[_-]?key|token|authorization|bearer|access[_-]?token|refresh[_-]?token|x[_-]?davix[_-]?bridge[_-]?token|password|secret|cookie|set-cookie|session|jwt|csrf)=([^&\s]+)/gi,
    match => match.replace(/=.*/, '=[REDACTED]')
  );
  scrubbed = scrubbed.replace(/\b(Bearer\s+)[A-Za-z0-9._\-~+/]+=*/gi, '$1[REDACTED]');
  scrubbed = scrubbed.replace(/\b(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|DROP|ALTER)\b[\s\S]{0,200}/gi, '[REDACTED]');
  scrubbed = scrubbed.replace(/(?:^|\s)(?:\/[\w.-]+){2,}(?=\s|$)/g, ' [REDACTED]');
  scrubbed = scrubbed.replace(/\b[A-Za-z]:\\(?:[^\\\s]+\\)*[^\\\s]+/g, '[REDACTED]');
  return scrubbed.trim();
}

function redactObject(value, depth = 0) {
  if (depth > 6) return '[REDACTED]';
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(item => redactObject(item, depth + 1));
  if (typeof value === 'string') return redactString(value);
  if (typeof value !== 'object') return value;

  const output = {};
  for (const [key, val] of Object.entries(value)) {
    output[key] = isSensitiveKey(key) ? '[REDACTED]' : redactObject(val, depth + 1);
  }
  return output;
}

function redactHeaders(headers = {}) {
  return redactObject(headers);
}

module.exports = {
  isSensitiveKey,
  redactString,
  redactObject,
  redactHeaders,
};
