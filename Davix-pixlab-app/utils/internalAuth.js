const { timingSafeEqual, createHash } = require('crypto');
const { sendError } = require('./errorResponse');
const { extractClientInfo } = require('./requestInfo');
const { logInternal, logRuntime } = require('./logger');
const { pool } = require('../db');
const { isProduction } = require('./config');
const { sendRateLimitStoreUnavailable } = require('./rateLimitFailures');

const fallbackRateLimitStore = new Map();

function parseAllowedIps() {
  return (process.env.INTERNAL_ALLOWED_IPS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
}

function safeTokenEquals(inputToken, expectedToken) {
  if (!inputToken || !expectedToken) return false;
  const input = Buffer.from(String(inputToken));
  const expected = Buffer.from(String(expectedToken));
  if (input.length !== expected.length) return false;
  return timingSafeEqual(input, expected);
}

function authorizeBridge(req) {
  const bridgeToken = req.headers['x-davix-bridge-token'];
  return (
    process.env.SUBSCRIPTION_BRIDGE_TOKEN &&
    bridgeToken &&
    safeTokenEquals(bridgeToken, process.env.SUBSCRIPTION_BRIDGE_TOKEN)
  );
}

function requireToken(req, res, next) {
  const bridgeToken = process.env.SUBSCRIPTION_BRIDGE_TOKEN;
  const header = req.headers['x-davix-bridge-token'];
  if (!bridgeToken) {
    console.error('[DAVIX][internal] missing SUBSCRIPTION_BRIDGE_TOKEN env, denying request');
    logInternal('internal.auth.missing_bridge_token', { path: req.path }, 'error');
    return sendError(res, 401, 'unauthorized', 'Access denied.');
  }
  if (!safeTokenEquals(header, bridgeToken)) {
    console.error('[DAVIX][internal] bridge token mismatch', { expected_header: 'x-davix-bridge-token' });
    logInternal('internal.auth.token_mismatch', { path: req.path }, 'warn');
    return sendError(res, 401, 'unauthorized', 'Access denied.');
  }
  return next();
}

function allowlistInternalIp(req, res, next) {
  const allowed = parseAllowedIps();
  if (!allowed.length) return next();
  const { ip } = extractClientInfo(req);
  if (!ip || !allowed.includes(ip)) {
    return sendError(res, 403, 'ip_not_allowed', 'IP address not allowed.');
  }
  return next();
}

function requireAllowlistedInternalIp(req, res, next) {
  const allowed = parseAllowedIps();
  if (!allowed.length) {
    return sendError(res, 403, 'ip_allowlist_required', 'IP allowlist is required for this endpoint.');
  }
  const { ip } = extractClientInfo(req);
  if (!ip || !allowed.includes(ip)) {
    return sendError(res, 403, 'ip_not_allowed', 'IP address not allowed.');
  }
  return next();
}

function getWindowStartSeconds(windowSeconds) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  return Math.floor(nowSeconds / windowSeconds) * windowSeconds;
}

function formatUtcDateTime(epochSeconds) {
  return new Date(epochSeconds * 1000).toISOString().slice(0, 19).replace('T', ' ');
}

function buildInternalRateLimitHash(token, ip, windowStartSeconds) {
  return createHash('sha256').update(`${token}:${ip}:${windowStartSeconds}`).digest('hex');
}

async function incrementInternalRateLimitDbCount({ token, ip, windowSeconds }) {
  const windowStartSeconds = getWindowStartSeconds(windowSeconds);
  const windowStart = formatUtcDateTime(windowStartSeconds);
  const keyHash = buildInternalRateLimitHash(token, ip, windowStartSeconds);
  let conn;
  try {
    conn = await pool.getConnection();
    await conn.query(
      `INSERT INTO internal_rate_limit_windows (window_start, key_hash, count)
       VALUES (?, ?, 1)
       ON DUPLICATE KEY UPDATE count = LAST_INSERT_ID(count + 1), updated_at = UTC_TIMESTAMP()`,
      [windowStart, keyHash]
    );
    const [rows] = await conn.query('SELECT LAST_INSERT_ID() AS count');
    return rows?.[0]?.count || 0;
  } finally {
    if (conn) conn.release();
  }
}

function incrementFallbackCount(key, windowSeconds) {
  const now = Date.now();
  const entry = fallbackRateLimitStore.get(key);
  if (!entry || entry.resetAt <= now) {
    fallbackRateLimitStore.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return 1;
  }
  entry.count += 1;
  return entry.count;
}

function internalRateLimit(req, res, next) {
  const limit = Number.parseInt(process.env.INTERNAL_RATE_LIMIT_PER_MIN, 10) || 60;
  const windowSeconds = Number.parseInt(process.env.INTERNAL_RATE_LIMIT_WINDOW_SECONDS, 10) || 60;
  if (!limit || limit <= 0) return next();

  const { ip } = extractClientInfo(req);
  const token = req.headers['x-davix-bridge-token'] || 'unknown';
  const clientIp = ip || 'unknown';

  (async () => {
    try {
      const count = await incrementInternalRateLimitDbCount({ token, ip: clientIp, windowSeconds });
      if (count > limit) {
        return sendError(res, 429, 'internal_rate_limited', 'Too many internal requests.', {
          details: {
            limit,
            window_seconds: windowSeconds,
          },
        });
      }
      return next();
    } catch (err) {
      if (isProduction()) {
        return sendRateLimitStoreUnavailable(res, req, 'internal', 'internal_rate_limit_windows', err, {
          failureMode: 'closed',
          retryAfterSeconds: windowSeconds,
        });
      }
      console.warn('[internal_rate_limit] DB error, falling back to memory store.', err);
      logRuntime('internal_rate_limit.db_error', { message: err.message }, 'warn');
      const windowStartSeconds = getWindowStartSeconds(windowSeconds);
      const fallbackKey = `${token}:${clientIp}:${windowStartSeconds}`;
      const count = incrementFallbackCount(fallbackKey, windowSeconds);
      if (count > limit) {
        return sendError(res, 429, 'internal_rate_limited', 'Too many internal requests.', {
          details: {
            limit,
            window_seconds: windowSeconds,
          },
        });
      }
      return next();
    }
  })();
}

const internalMiddleware = [allowlistInternalIp, requireToken, internalRateLimit];
const diagnosticsInternalMiddleware = [requireAllowlistedInternalIp, requireToken, internalRateLimit];

module.exports = {
  authorizeBridge,
  allowlistInternalIp,
  requireToken,
  internalRateLimit,
  internalMiddleware,
  diagnosticsInternalMiddleware,
};
