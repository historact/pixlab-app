const { timingSafeEqual } = require('crypto');
const { sendError } = require('./errorResponse');
const { extractClientInfo } = require('./requestInfo');
const { logInternal } = require('./logger');

const rateLimitStore = new Map();

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

function internalRateLimit(req, res, next) {
  const limit = Number.parseInt(process.env.INTERNAL_RATE_LIMIT_PER_MIN, 10) || 60;
  const windowSeconds = Number.parseInt(process.env.INTERNAL_RATE_LIMIT_WINDOW_SECONDS, 10) || 60;
  if (!limit || limit <= 0) return next();

  const { ip } = extractClientInfo(req);
  const token = req.headers['x-davix-bridge-token'] || 'unknown';
  const key = `${token}:${ip || 'unknown'}`;
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const entry = rateLimitStore.get(key);

  if (!entry || entry.resetAt <= now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return next();
  }

  if (entry.count >= limit) {
    return sendError(res, 429, 'internal_rate_limited', 'Too many internal requests.', {
      details: {
        limit,
        window_seconds: windowSeconds,
      },
    });
  }

  entry.count += 1;
  return next();
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
