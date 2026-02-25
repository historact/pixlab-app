const { sendError } = require('./errorResponse');
const { logNormalizedError } = require('./logger');
const { addRequestDiagnostics } = require('./requestInfo');

const REASON_ENUM = new Set([
  'request_validation_failed',
  'upload_validation_failed',
  'processing_failed',
  'database_operation_failed',
  'rate_limit_storage_unavailable',
  'timeout',
  'server_busy',
  'quota_exceeded',
  'too_many_files',
]);

const OPERATION_ENUM = new Set([
  'upload_validation',
  'image_processing',
  'pdf_processing',
  'tools_processing',
  'html_render',
  'quota_check',
  'rate_limit',
  'request_validation',
  'subscription_event',
  'unhandled_error',
]);

const SCOPE_ENUM = new Set([
  'image_daily',
  'pdf_daily',
  'tools_daily',
  'h2i_daily',
  'tools_concurrency',
  'burst',
  'rate_limits_daily',
  'burst_limits_window',
]);

function isPublicRequest(req) {
  const path = String(req?.originalUrl || req?.path || '');
  return path.startsWith('/v1/');
}

function inferChannel(req) {
  const path = String(req?.originalUrl || req?.path || '');
  if (path.startsWith('/internal/')) return 'internal';
  if (path.startsWith('/v1/')) return 'external';
  return 'runtime';
}

function deriveActorContext(req) {
  return {
    request_id: req?.requestId || null,
    api_key_id: req?.customerKey?.id || req?.apiKeyRecord?.id || req?.apiKeyId || null,
    user_id: req?.customerKey?.user_id || req?.customerKey?.wp_user_id || req?.user?.id || null,
    wp_user_id: req?.customerKey?.wp_user_id || req?.user?.wp_user_id || null,
    plan_slug: req?.customerKey?.plan_slug || req?.customerKey?.plan || null,
    plan_name: req?.customerKey?.plan_name || null,
    plan_price: req?.customerKey?.plan_price ?? null,
  };
}

function pickEnum(value, allowed) {
  if (typeof value !== 'string') return undefined;
  return allowed.has(value) ? value : undefined;
}

function toSafeDetails(details = {}) {
  if (!details || typeof details !== 'object') return undefined;
  const out = {};
  const add = (key, value) => {
    if (value === undefined || value === null || value === '') return;
    out[key] = value;
  };
  add('allowed', details.allowed);
  add('received', details.received);
  add('field', details.field);
  add('limit', details.limit);
  add('used', details.used);
  add('remaining', details.remaining);
  add('period', details.period);
  add('retry_after_seconds', details.retry_after_seconds);
  add('action', details.action);
  add('endpoint', details.endpoint);
  add('plan_slug', details.plan_slug);
  add('plan_name', details.plan_name);
  add('plan_price', details.plan_price);
  add('allowed_actions', Array.isArray(details.allowed_actions) ? details.allowed_actions.filter(v => typeof v === 'string') : undefined);
  add('fields', Array.isArray(details.fields) ? details.fields.filter(v => typeof v === 'string').slice(0, 25) : undefined);
  add('quota_name', details.quota_name);
  add('rule', details.rule);
  add('reason', pickEnum(details.reason, REASON_ENUM));
  add('operation', pickEnum(details.operation, OPERATION_ENUM));
  add('scope', pickEnum(details.scope, SCOPE_ENUM));
  return Object.keys(out).length ? out : undefined;
}

function normalizeError(err, req, ctx = {}) {
  const statusCode = Number(ctx.statusCode || err?.statusCode || err?.status || 500);
  const channel = ctx.channel || inferChannel(req);
  const level = ctx.level || (statusCode >= 500 ? 'error' : 'warn');
  const code = ctx.code || err?.publicCode || (typeof err?.code === 'string' ? err.code : null) || (statusCode >= 500 ? 'internal_error' : 'invalid_parameter');

  const defaultMessage = statusCode >= 500 ? 'Something went wrong on the server.' : 'Request failed.';
  const message = ctx.message || err?.publicMessage || (statusCode >= 500 ? defaultMessage : (err?.message || defaultMessage));
  const hint = ctx.hint !== undefined ? ctx.hint : err?.hint;
  const details = toSafeDetails(ctx.details || err?.details || {});
  const safeSummary = ctx.safeSummary || `${code} at ${ctx.component || 'api'}.${ctx.operation || 'request'}`;

  const payload = {
    ...deriveActorContext(req),
    component: ctx.component || 'api',
    operation: ctx.operation || 'request',
    stage: ctx.stage || null,
    endpoint: ctx.endpoint || null,
    action: ctx.action || null,
    scope: ctx.scope || details?.scope || null,
    status_code: statusCode,
    error_code: code,
    error_class: err?.name || null,
    upstream_error_code: typeof err?.code === 'string' ? err.code : null,
    safe_summary: safeSummary,
    remediation_hint: ctx.remediationHint || hint || null,
    diagnostics: {
      allowed: details?.allowed,
      received: details?.received,
      field: details?.field,
      limit: details?.limit,
      used: details?.used,
      remaining: details?.remaining,
      period: details?.period,
      retry_after_seconds: details?.retry_after_seconds,
      reason: details?.reason,
      operation: details?.operation,
      scope: details?.scope,
      fields: details?.fields,
      quota_name: details?.quota_name,
      rule: details?.rule,
      failure_mode: ctx.failure_mode || null,
      storage_source: ctx.storage_source || null,
      db_error_class: ctx.db_error_class || null,
      db_errno: ctx.db_errno || null,
      db_sql_state: ctx.db_sql_state || null,
    },
  };

  if (channel !== 'external') {
    payload.stack = err?.stack || null;
    payload.error_message = err?.message || null;
  }

  return {
    user: {
      statusCode,
      code,
      message,
      hint,
      details,
    },
    admin: {
      channel,
      level,
      event: ctx.event || 'error.normalized',
      payload,
    },
  };
}

function writeAdminDiagnostic(admin) {
  if (!admin) return;
  logNormalizedError(admin);
}

function attachExternalDiagnostics(req, admin) {
  if (!req || !admin || admin.channel !== 'external') return;
  addRequestDiagnostics(req, {
    failure: {
      event: admin.event || 'error.normalized',
      level: admin.level || 'error',
      ...(admin.payload || {}),
    },
  });
}

function sendNormalizedError(res, req, err, ctx = {}) {
  const normalized = normalizeError(err, req, ctx);
  if (normalized.admin?.channel === 'external') {
    attachExternalDiagnostics(req, normalized.admin);
  } else {
    writeAdminDiagnostic(normalized.admin);
  }
  const { statusCode, code, message, hint, details } = normalized.user;
  return sendError(res, statusCode, code, message, { hint, details });
}

module.exports = {
  normalizeError,
  sendNormalizedError,
};
