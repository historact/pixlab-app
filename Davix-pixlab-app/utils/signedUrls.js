const crypto = require('crypto');
const { getSignedUrlConfig } = require('./config');
const { sendError } = require('./errorResponse');
const { logRuntime } = require('./logger');

function sign(pathname, exp, secret, algo) {
  return crypto.createHmac(algo, secret).update(`${pathname}|${exp}`).digest('hex');
}

function buildSignedUrl(baseUrl, pathname, ttlSeconds) {
  const { secret, ttlSeconds: defaultTtl, algo, requireSignedUrls } = getSignedUrlConfig();
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const ttl = Number.isFinite(ttlSeconds) ? ttlSeconds : defaultTtl;

  if (!secret) {
    const error = new Error('SIGNED_URL_SECRET is required to build signed URLs.');
    if (requireSignedUrls) {
      logRuntime('signed_urls.missing_secret', {}, 'error');
      throw error;
    }
    return `${normalizedBase}${pathname}`;
  }

  const exp = Math.floor(Date.now() / 1000) + ttl;
  const sig = sign(pathname, exp, secret, algo);
  return `${normalizedBase}${pathname}?exp=${exp}&sig=${sig}`;
}


function safeTokenEquals(inputToken, expectedToken) {
  const input = Buffer.from(String(inputToken || ''));
  const expected = Buffer.from(String(expectedToken || ''));
  const maxLength = Math.max(input.length, expected.length, 1);
  const paddedInput = Buffer.alloc(maxLength);
  const paddedExpected = Buffer.alloc(maxLength);
  input.copy(paddedInput);
  expected.copy(paddedExpected);
  const equal = crypto.timingSafeEqual(paddedInput, paddedExpected);
  return equal && input.length === expected.length;
}

function verifySignature(pathname, exp, sig) {
  const { secret, algo } = getSignedUrlConfig();
  if (!secret) return false;
  const expected = sign(pathname, exp, secret, algo);
  return safeTokenEquals(sig, expected);
}

function signedStaticGuard() {
  return (req, res, next) => {
    const { requireSignedUrls } = getSignedUrlConfig();
    if (!requireSignedUrls) return next();

    const expRaw = req.query?.exp;
    const sig = req.query?.sig;
    if (!expRaw || !sig) {
      return sendError(res, 403, 'unauthorized', 'Missing signed URL parameters.', {
        hint: 'Signed URLs require exp and sig query parameters.',
      });
    }

    const exp = parseInt(expRaw, 10);
    if (!Number.isFinite(exp)) {
      return sendError(res, 403, 'invalid_signature', 'Invalid signature parameters.');
    }

    const now = Math.floor(Date.now() / 1000);
    if (exp < now) {
      return sendError(res, 403, 'expired', 'Signed URL has expired.');
    }

    const pathname = `${req.baseUrl || ''}${req.path || ''}`;
    if (!verifySignature(pathname, exp, sig)) {
      return sendError(res, 403, 'invalid_signature', 'Signed URL signature is invalid.');
    }

    return next();
  };
}

function createSignedStaticHeaders() {
  const { cacheControl } = getSignedUrlConfig();
  return res => {
    res.setHeader('Cache-Control', cacheControl);
    res.setHeader('X-Content-Type-Options', 'nosniff');
  };
}

module.exports = {
  sign,
  buildSignedUrl,
  verifySignature,
  signedStaticGuard,
  createSignedStaticHeaders,
};
