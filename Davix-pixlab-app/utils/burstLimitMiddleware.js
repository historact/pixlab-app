const { sendError } = require('./errorResponse');
const { getCustomerBurstConfig, getRateLimitFailClosed } = require('./config');
const { incrementAndGetBurstCount } = require('./burstLimits');
const { logRuntime } = require('./logger');
const { sendRateLimitStoreUnavailable } = require('./rateLimitFailures');

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
          const retryAfterSeconds = resolvedWindow;
          res.setHeader('Retry-After', String(retryAfterSeconds));
          return sendError(res, 429, 'rate_limit_exceeded', 'Too many requests in a short time window.', {
            hint: 'Slow down and retry in a minute.',
            details: { scope: 'burst', retry_after_seconds: retryAfterSeconds },
          });
        }
        return next();
      } catch (err) {
        if (getRateLimitFailClosed()) {
          return sendRateLimitStoreUnavailable(res, req, scope, 'burst_limits_window', err, { failureMode: 'closed' });
        }
        console.warn('[burst_limit] Failed to update burst_limits_window, continuing without limit.', err);
        logRuntime('burst_limit.update_failed', { message: err.message }, 'warn');
        return next();
      }
    })();
  };
}

module.exports = { createCustomerBurstLimiter };
