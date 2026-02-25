const { logRuntime } = require('./logger');
const { sendNormalizedError } = require('./errorNormalizer');

function sendRateLimitStoreUnavailable(res, req, scope, source, error = null, options = {}) {
  const requestId = req?.requestId || null;
  const retryAfterSeconds = Number(options.retryAfterSeconds) > 0 ? Math.ceil(Number(options.retryAfterSeconds)) : null;
  const payload = {
    scope,
    source,
    request_id: requestId,
    failure_mode: options.failureMode || null,
    db_error_class: error?.code || null,
    db_errno: error?.errno || null,
    db_sql_state: error?.sqlState || null,
  };
  console.warn('[rate_limit] store unavailable', payload);
  logRuntime('rate_limit.store_unavailable', payload, 'error');
  if (retryAfterSeconds) {
    res.setHeader('Retry-After', String(retryAfterSeconds));
  }
  return sendNormalizedError(res, req, error || new Error('rate_limit_store_unavailable'), {
    statusCode: 503,
    code: 'rate_limit_store_unavailable',
    message: 'Service temporarily unavailable',
    hint: 'Try again later.',
    details: {
      scope,
      retry_after_seconds: retryAfterSeconds || undefined,
      reason: 'rate_limit_storage_unavailable',
      operation: 'rate_limit',
    },
    component: 'rate_limit',
    operation: 'rate_limit',
    stage: 'storage_unavailable',
    scope,
    event: 'rate_limit.store_unavailable',
    level: 'error',
    failure_mode: options.failureMode || null,
    storage_source: source,
    db_error_class: error?.code || null,
    db_errno: error?.errno || null,
    db_sql_state: error?.sqlState || null,
    remediationHint: 'Restore rate-limit storage availability or use configured fallback mode.',
  });
}

module.exports = { sendRateLimitStoreUnavailable };
