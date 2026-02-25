const net = require('net');
const { parseTrustProxySetting } = require('./config');

function normalizeIp(value) {
  if (!value) return null;
  const trimmed = Array.isArray(value) ? value[0] : String(value);
  const candidate = trimmed.split(',')[0].trim();
  if (!candidate) return null;
  return net.isIP(candidate) ? candidate : null;
}

function extractClientInfo(req) {
  const trustProxy = parseTrustProxySetting();
  const trustProxyEnabled = trustProxy !== false && trustProxy !== 0;
  let ip = null;

  if (trustProxyEnabled) {
    const cfIp = normalizeIp(req.headers['cf-connecting-ip']);
    const forwardedIp = normalizeIp(req.headers['x-forwarded-for']);
    ip = cfIp || forwardedIp || normalizeIp(req.ip);
  } else {
    ip = normalizeIp(req.ip);
  }

  const userAgentHeader = req.headers['user-agent'];
  const userAgent = userAgentHeader ? String(userAgentHeader) : null;
  return { ip: ip || null, userAgent };
}


function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function mergeInto(target, source) {
  if (!isPlainObject(source)) return target;
  Object.keys(source).forEach(key => {
    const incoming = source[key];
    if (incoming === undefined) return;
    if (isPlainObject(incoming)) {
      if (!isPlainObject(target[key])) {
        target[key] = {};
      }
      mergeInto(target[key], incoming);
      return;
    }
    if (Array.isArray(incoming)) {
      target[key] = incoming.slice(0, 50);
      return;
    }
    target[key] = incoming;
  });
  return target;
}

function ensureRequestDiagnostics(req) {
  if (!req || typeof req !== 'object') return null;
  if (!isPlainObject(req._diag)) {
    req._diag = {};
  }
  return req._diag;
}

function addRequestDiagnostics(req, diagnostics = {}) {
  const store = ensureRequestDiagnostics(req);
  if (!store) return null;
  return mergeInto(store, diagnostics);
}

function getRequestDiagnostics(req) {
  if (!req || !isPlainObject(req._diag)) return null;
  return req._diag;
}

module.exports = { extractClientInfo, addRequestDiagnostics, getRequestDiagnostics };
