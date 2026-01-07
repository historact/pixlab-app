const crypto = require('crypto');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const DEFAULT_HEADER = 'x-csrf-token';
const DEFAULT_BODY_FIELD = '_csrf';
const TOKEN_BYTES = 32;

function generateToken() {
  return crypto.randomBytes(TOKEN_BYTES).toString('hex');
}

function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function csrfProtection({ header = DEFAULT_HEADER, bodyField = DEFAULT_BODY_FIELD } = {}) {
  return (req, res, next) => {
    if (!req.session) {
      return res.status(500).send('CSRF session unavailable');
    }

    if (!req.session.csrfToken) {
      req.session.csrfToken = generateToken();
    }

    req.csrfToken = () => req.session.csrfToken;

    if (SAFE_METHODS.has(req.method)) {
      return next();
    }

    const headerToken = req.get(header) || req.get(header.toLowerCase());
    const bodyToken = req.body?.[bodyField];
    const queryToken = req.query?.[bodyField];
    const supplied = headerToken || bodyToken || queryToken;

    if (!supplied || !safeCompare(supplied, req.session.csrfToken)) {
      return res.status(403).send('Invalid CSRF token');
    }

    return next();
  };
}

module.exports = { csrfProtection };
