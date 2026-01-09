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

module.exports = { extractClientInfo };
