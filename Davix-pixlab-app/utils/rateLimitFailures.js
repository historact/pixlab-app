const { logRuntime } = require('./logger');
const { sendError } = require('./errorResponse');

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
  return sendError(res, 503, 'rate_limit_store_unavailable', 'Service temporarily unavailable', {
    details: 'Rate-limit storage unavailable',
  });
}

module.exports = { sendRateLimitStoreUnavailable };
