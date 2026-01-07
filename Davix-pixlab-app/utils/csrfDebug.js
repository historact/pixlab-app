const crypto = require('crypto');
const { logInternal } = require('./logger');

const DEBUG_FLAG = 'DAVIX_DEBUG_INTERNAL';
const LOGIN_HASH_KEY = '_csrfLoginSessionHash';

function isDebugEnabled() {
  return process.env[DEBUG_FLAG] === '1';
}

function hashSessionId(sessionId) {
  if (!sessionId) return null;
  return crypto.createHash('sha256').update(sessionId).digest('hex').slice(0, 6);
}

function getSessionCookieDetails(req, sessionCookieName) {
  const cookie = req.session?.cookie || {};
  return {
    name: sessionCookieName,
    secure: cookie.secure,
    sameSite: cookie.sameSite,
    domain: cookie.domain,
    path: cookie.path,
    httpOnly: cookie.httpOnly,
    maxAge: cookie.maxAge,
  };
}

function parseSetCookieOptions(rawSetCookie) {
  if (!rawSetCookie) return null;
  const header = Array.isArray(rawSetCookie) ? rawSetCookie[0] : rawSetCookie;
  if (!header) return null;
  const parts = header.split(';').map(part => part.trim());
  const attrs = parts.slice(1);
  const output = {
    secure: false,
    httpOnly: false,
    sameSite: null,
    domain: null,
    path: null,
    maxAge: null,
  };
  for (const attr of attrs) {
    const [keyRaw, ...valueParts] = attr.split('=');
    const key = keyRaw.toLowerCase();
    const value = valueParts.join('=');
    if (key === 'secure') output.secure = true;
    if (key === 'httponly') output.httpOnly = true;
    if (key === 'samesite') output.sameSite = value || null;
    if (key === 'domain') output.domain = value || null;
    if (key === 'path') output.path = value || null;
    if (key === 'max-age') output.maxAge = value || null;
  }
  return output;
}

function logAdminDebug(req, payload) {
  if (!isDebugEnabled()) return;
  logInternal('admin.csrf.debug', {
    request_id: req.requestId,
    method: req.method,
    path: req.originalUrl,
    ...payload,
  });
}

function resolveSessionCookieName(req, sessionCookieName, getSessionCookieName) {
  if (typeof getSessionCookieName === 'function') {
    return getSessionCookieName(req);
  }
  if (typeof sessionCookieName === 'string') {
    return sessionCookieName;
  }
  return req.app?.get?.('adminSessionCookieName') || 'pixlab_admin';
}

function createAdminDebugMiddleware({ sessionCookieName, getSessionCookieName } = {}) {
  return (req, res, next) => {
    if (!isDebugEnabled()) return next();
    const resolvedName = resolveSessionCookieName(req, sessionCookieName, getSessionCookieName);
    const sessionHash = hashSessionId(req.sessionID);
    logAdminDebug(req, {
      stage: 'request',
      host: req.headers.host,
      origin: req.headers.origin,
      referer: req.headers.referer,
      secure: req.secure,
      protocol: req.protocol,
      forwarded_proto: req.headers['x-forwarded-proto'],
      session_id_present: Boolean(req.sessionID),
      session_id_hash: sessionHash,
      cookie_header_present: Boolean(req.headers.cookie),
      session_cookie: getSessionCookieDetails(req, resolvedName),
    });

    res.on('finish', () => {
      const setCookieHeader = res.getHeader('set-cookie');
      const setCookiePresent = Array.isArray(setCookieHeader)
        ? setCookieHeader.length > 0
        : Boolean(setCookieHeader);
      logAdminDebug(req, {
        stage: 'response',
        status: res.statusCode,
        set_cookie_present: setCookiePresent,
        set_cookie_options: parseSetCookieOptions(setCookieHeader),
      });
    });
    next();
  };
}

function stashLoginSessionHash(req) {
  if (!req.session) return;
  req.session[LOGIN_HASH_KEY] = hashSessionId(req.sessionID);
}

function compareLoginSessionHash(req) {
  if (!req.session) return null;
  const previous = req.session[LOGIN_HASH_KEY];
  if (!previous) return null;
  const current = hashSessionId(req.sessionID);
  return Boolean(current && previous === current);
}

module.exports = {
  createAdminDebugMiddleware,
  stashLoginSessionHash,
  compareLoginSessionHash,
  logAdminDebug,
};
