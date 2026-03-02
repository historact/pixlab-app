const crypto = require('crypto');
const { compareLoginSessionHash, logAdminDebug } = require('./csrfDebug');
const { sendError } = require('./errorResponse');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const DEFAULT_HEADER = 'x-csrf-token';
const DEFAULT_BODY_FIELD = '_csrf';

function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function deriveToken(sessionId, secret) {
  return crypto.createHmac('sha256', secret).update(sessionId).digest('hex');
}

function resolveSecret(req, getSecret) {
  if (typeof getSecret === 'function') {
    return getSecret(req);
  }
  if (typeof getSecret === 'string') {
    return getSecret;
  }
  return req.app?.get?.('adminSessionSecret') || '';
}

function getSuppliedToken(req, header, bodyField) {
  const headerToken = req.get(header) || req.get(header.toLowerCase());
  if (headerToken) return { value: headerToken, source: 'header' };
  const bodyToken = req.body?.[bodyField];
  if (bodyToken) return { value: bodyToken, source: 'body' };
  const queryToken = req.query?.[bodyField];
  if (queryToken) return { value: queryToken, source: 'query' };
  return { value: null, source: null };
}

function isApiRequest(req) {
  const path = req.path || '';
  if (path.startsWith('/api/')) return true;
  if (req.xhr) return true;
  const accept = req.headers?.accept || '';
  if (accept.includes('application/json')) return true;
  const contentType = req.headers?.['content-type'] || '';
  if (contentType.includes('application/json')) return true;
  return false;
}

function csrfProtection({ header = DEFAULT_HEADER, bodyField = DEFAULT_BODY_FIELD, getSecret } = {}) {
  return (req, res, next) => {
    if (!req.session) {
      logAdminDebug(req, {
        stage: 'csrf',
        error: 'session_unavailable',
      });
      if (isApiRequest(req)) {
        return sendError(res, 500, 'csrf_session_unavailable', 'CSRF session unavailable.');
      }
      return res.status(500).send('CSRF session unavailable');
    }

    if (!req.sessionID) {
      logAdminDebug(req, {
        stage: 'csrf',
        error: 'session_id_missing',
      });
      if (isApiRequest(req)) {
        return sendError(res, 500, 'csrf_session_unavailable', 'CSRF session unavailable.');
      }
      return res.status(500).send('CSRF session unavailable');
    }

    const secret = resolveSecret(req, getSecret);
    if (!secret) {
      logAdminDebug(req, {
        stage: 'csrf',
        error: 'secret_missing',
      });
      if (isApiRequest(req)) {
        return sendError(res, 500, 'csrf_secret_unavailable', 'CSRF secret unavailable.');
      }
      return res.status(500).send('CSRF secret unavailable');
    }

    const expected = deriveToken(req.sessionID, secret);
    req.csrfToken = () => expected;

    if (SAFE_METHODS.has(req.method)) {
      if (req.session?.isNew) {
        req.session._csrfTokenIssuedAt = Date.now();
      }
      return next();
    }

    const supplied = getSuppliedToken(req, header, bodyField);
    const match = supplied.value ? safeCompare(supplied.value, expected) : false;
    const loginSessionMatch = compareLoginSessionHash(req);

    logAdminDebug(req, {
      stage: 'csrf',
      supplied_token_present: Boolean(supplied.value),
      supplied_token_length: supplied.value ? supplied.value.length : 0,
      supplied_token_source: supplied.source,
      expected_token_length: expected.length,
      token_match: match,
      login_session_match: loginSessionMatch,
    });

    if (!match) {
      if (isApiRequest(req)) {
        return sendError(res, 403, 'csrf_invalid', 'Invalid CSRF token.');
      }
      return res.status(403).send('Invalid CSRF token');
    }

    return next();
  };
}

module.exports = { csrfProtection };
