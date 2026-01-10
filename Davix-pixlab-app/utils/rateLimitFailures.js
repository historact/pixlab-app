const { logRuntime } = require('./logger');
const { attachRequestId } = require('./responseMeta');

function sendRateLimitStoreUnavailable(res, req, scope, source) {
  const requestId = req?.requestId || null;
  // Likely DB outage causes: network/DNS issues, DB restart/crash, max connections exhausted,
  // disk full, long-running locks/slow queries, or migration conflicts.
  const payload = {
    scope,
    source,
    request_id: requestId,
  };
  console.warn('[rate_limit] store unavailable', payload);
  logRuntime('rate_limit.store_unavailable', payload, 'error');
  return res.status(503).json(
    attachRequestId(req, {
      error: {
        code: 'rate_limit_store_unavailable',
        message: 'Service temporarily unavailable',
        detail: 'Rate-limit storage unavailable',
      },
    })
  );
}

module.exports = { sendRateLimitStoreUnavailable };
