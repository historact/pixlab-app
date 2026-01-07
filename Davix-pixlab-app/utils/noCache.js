function setNoStore(res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  res.setHeader('X-Accel-Expires', '0');
  res.setHeader('Vary', 'Cookie');
  res.setHeader('X-PixLab-Admin-NoStore', '1');
}

module.exports = { setNoStore };
