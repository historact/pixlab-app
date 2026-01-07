const { sendError } = require('./errorResponse');
const { getCustomerBurstConfig } = require('./config');
const { incrementAndGetBurstCount } = require('./burstLimits');

function createCustomerBurstLimiter(scope) {
  return (req, res, next) => {
    if (req.apiKeyType !== 'customer') return next();
    const { limitPerMin, windowSeconds } = getCustomerBurstConfig();
    if (!limitPerMin || limitPerMin <= 0) return next();
    if (!req.customerKey?.id) return next();

    const resolvedWindow = windowSeconds > 0 ? windowSeconds : 60;

    (async () => {
      try {
        const { count } = await incrementAndGetBurstCount({
          apiKeyId: req.customerKey.id,
          scope,
          incrementBy: 1,
          windowSeconds: resolvedWindow,
        });
        if (count > limitPerMin) {
          return sendError(res, 429, 'rate_limit_exceeded', 'Too many requests in a short time window.', {
            hint: 'Slow down and retry in a minute.',
          });
        }
        return next();
      } catch (err) {
        console.warn('[burst_limit] Failed to update burst_limits_window, continuing without limit.', err);
        return next();
      }
    })();
  };
}

module.exports = { createCustomerBurstLimiter };
