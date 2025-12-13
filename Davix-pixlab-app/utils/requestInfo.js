function extractClientInfo(req) {
  const xff = req.headers['x-forwarded-for'] || '';
  const forwarded = Array.isArray(xff) ? xff[0] : xff.split(',')[0].trim();
  const ip = req.headers['cf-connecting-ip'] || forwarded || req.ip || null;
  const userAgentHeader = req.headers['user-agent'];
  const userAgent = userAgentHeader ? String(userAgentHeader) : null;
  return { ip: ip || null, userAgent };
}

module.exports = { extractClientInfo };
