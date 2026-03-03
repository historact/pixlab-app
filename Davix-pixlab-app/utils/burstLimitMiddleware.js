const { sendError } = require('./errorResponse');
const { getRateLimitFailClosed } = require('./config');
const { incrementAndGetBurstCount } = require('./burstLimits');
const { logRuntime } = require('./logger');
const { sendRateLimitStoreUnavailable } = require('./rateLimitFailures');
const { normalizePlan } = require('./limits');

function createCustomerBurstLimiter(scope) {
  return (req, res, next) => {
    if (req.apiKeyType !== 'customer') return next();
    const plan = normalizePlan(req.customerKey?.plan || null);
    const limitPerMin = Number(plan?.burst_limit_per_min || 0);
    const configuredWindow = Number(plan?.burst_window_seconds || 0);
    const appliesToRaw = (plan?.burst_applies_to || 'h2i').toString().trim().toLowerCase();
    const appliesTo = appliesToRaw === 'all' ? 'all' : 'h2i';
    if (appliesTo !== 'all' && appliesTo !== scope) return next();
    const windowSeconds = configuredWindow > 0 ? configuredWindow : 60;
    if (!limitPerMin || limitPerMin <= 0) return next();
    if (!req.customerKey?.id) return next();

    (async () => {
      try {
        const { count } = await incrementAndGetBurstCount({
          apiKeyId: req.customerKey.id,
          scope,
          incrementBy: 1,
          windowSeconds,
        });
        if (count > limitPerMin) {
          const retryAfterSeconds = windowSeconds;
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
