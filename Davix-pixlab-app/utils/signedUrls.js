const crypto = require('crypto');
const { getSignedUrlConfig } = require('./config');
const { sendError } = require('./errorResponse');

function sign(pathname, exp, secret, algo) {
  return crypto.createHmac(algo, secret).update(`${pathname}|${exp}`).digest('hex');
}

function buildSignedUrl(baseUrl, pathname, ttlSeconds) {
  const { secret, ttlSeconds: defaultTtl, algo, requireSignedUrls } = getSignedUrlConfig();
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const ttl = Number.isFinite(ttlSeconds) ? ttlSeconds : defaultTtl;

  if (!secret) {
    if (requireSignedUrls) {
      console.warn('[signed_urls] Missing SIGNED_URL_SECRET while signing is required.');
    }
    return `${normalizedBase}${pathname}`;
  }

  const exp = Math.floor(Date.now() / 1000) + ttl;
  const sig = sign(pathname, exp, secret, algo);
  return `${normalizedBase}${pathname}?exp=${exp}&sig=${sig}`;
}

function verifySignature(pathname, exp, sig) {
  const { secret, algo } = getSignedUrlConfig();
  if (!secret) return false;
  const expected = sign(pathname, exp, secret, algo);
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
  } catch (err) {
    return false;
  }
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
