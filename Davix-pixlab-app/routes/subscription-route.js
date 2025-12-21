const { sendError } = require('../utils/errorResponse');
const { activateOrProvisionKey, applySubscriptionStateChange, disableCustomerKey } = require('../utils/customerKeys');
const { generateApiKey } = require('../utils/apiKeys');
const { pool } = require('../db');
const {
  getValidFromGraceSeconds,
  normalizeManualValidFrom,
  parseISO8601,
  parseMysqlUtcDatetime,
  utcNow,
} = require('../utils/time');
const { getUsagePeriodForKey } = require('../usage');

let planSchemaCache = { maxDimension: null };
let columnExistsCache = {};
let freePlanCache = null;
const debugInternal = process.env.DAVIX_DEBUG_INTERNAL === '1';

function parseAdminValidityWindow(payload = {}, now = utcNow(), graceSeconds = getValidFromGraceSeconds()) {
  const fromInput = payload.valid_from ?? payload.validFrom;
  const untilInput = payload.valid_until ?? payload.validUntil;

  const from = parseISO8601(fromInput);
  const until = parseISO8601(untilInput);

  if (from.error) {
    return { error: 'invalid_parameter', message: 'valid_from must be a valid ISO8601 date.' };
  }

  if (until.error) {
    return { error: 'invalid_parameter', message: 'valid_until must be a valid ISO8601 date.' };
  }

  const normalizedFrom = from.date ? normalizeManualValidFrom(from.date, now, graceSeconds) : null;
  const normalizedUntil = until.date || null;

  if (normalizedFrom && normalizedUntil && normalizedUntil.getTime() <= normalizedFrom.getTime()) {
    return { error: 'invalid_parameter', message: 'valid_until must be after valid_from.' };
  }

  return {
    validFrom: normalizedFrom,
    validUntil: normalizedUntil,
    providedValidFrom: from.provided,
    providedValidUntil: until.provided,
  };
}

function getUtcMonthWindow(date = new Date()) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 0, 0, 0));
  return { start, end };
}

async function columnExists(table, column) {
  const cacheKey = `${table}.${column}`;
  if (Object.prototype.hasOwnProperty.call(columnExistsCache, cacheKey)) {
    return columnExistsCache[cacheKey];
  }

  try {
    const [rows] = await pool.execute(
      `SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1`,
      [table, column]
    );
    columnExistsCache[cacheKey] = rows.length > 0;
  } catch (err) {
    columnExistsCache[cacheKey] = false;
  }

  return columnExistsCache[cacheKey];
}

async function findKeyRow(identifierField, identifierValue, executor = pool) {
  const [rows] = await executor.execute(
    `SELECT * FROM api_keys WHERE ${identifierField} = ? ORDER BY updated_at DESC LIMIT 1`,
    [identifierValue]
  );
  return rows[0] || null;
}

async function resolveKeyFromIdentifiers({ subscription_id = null, customer_email = null, order_id = null }, executor = pool) {
  const subscriptionColumnExists = await columnExists('api_keys', 'subscription_id');
  const wpSubscriptionColumnExists = await columnExists('api_keys', 'wp_subscription_id');
  const orderIdColumnExists = await columnExists('api_keys', 'order_id');
  const wpOrderIdColumnExists = await columnExists('api_keys', 'wp_order_id');
  const customerEmailColumnExists = await columnExists('api_keys', 'customer_email');

  if (debugInternal) {
    console.log('[DAVIX][internal] api_keys column presence', {
      subscription_id: subscriptionColumnExists,
      wp_subscription_id: wpSubscriptionColumnExists,
      order_id: orderIdColumnExists,
      wp_order_id: wpOrderIdColumnExists,
      customer_email: customerEmailColumnExists,
    });
  }

  const searches = [];

  if (subscription_id && (subscriptionColumnExists || wpSubscriptionColumnExists)) {
    const subscriptionPredicates = [];
    const subscriptionParams = [];

    if (subscriptionColumnExists) {
      subscriptionPredicates.push('subscription_id = ?');
      subscriptionParams.push(subscription_id);
    }

    if (wpSubscriptionColumnExists) {
      subscriptionPredicates.push('wp_subscription_id = ?');
      subscriptionParams.push(subscription_id);
    }

    if (subscriptionPredicates.length > 0) {
      searches.push({
        type: 'subscription_id',
        value: subscription_id,
        sql: `(${subscriptionPredicates.join(' OR ')})`,
        params: subscriptionParams,
      });
    }
  }

  if (order_id && (orderIdColumnExists || wpOrderIdColumnExists)) {
    const orderPredicates = [];
    const orderParams = [];

    if (orderIdColumnExists) {
      orderPredicates.push('order_id = ?');
      orderParams.push(order_id);
    }

    if (wpOrderIdColumnExists) {
      orderPredicates.push('wp_order_id = ?');
      orderParams.push(order_id);
    }

    if (orderPredicates.length > 0) {
      searches.push({
        type: 'order_id',
        value: order_id,
        sql: `(${orderPredicates.join(' OR ')})`,
        params: orderParams,
      });
    }
  }

  if (customer_email && customerEmailColumnExists) {
    searches.push({
      type: 'customer_email',
      value: customer_email,
      sql: 'customer_email = ?',
      params: [customer_email],
    });
  }

  for (const search of searches) {
    const [rows] = await executor.execute(
      `SELECT * FROM api_keys WHERE ${search.sql} ORDER BY updated_at DESC LIMIT 1`,
      search.params
    );
    if (rows[0]) {
      if (debugInternal) {
        console.log('[DAVIX][internal] identity resolved', { type: search.type });
      }
      return { keyRow: rows[0], identity_used: { type: search.type, value: search.value } };
    }
  }

  if (debugInternal) {
    console.log('[DAVIX][internal] identity resolution failed');
  }

  return { keyRow: null, identity_used: null };
}

async function findApiKeyIdsForIdentity({ subscription_id = null, customer_email = null, order_id = null }, executor = pool) {
  const subscriptionColumnExists = await columnExists('api_keys', 'subscription_id');
  const wpSubscriptionColumnExists = await columnExists('api_keys', 'wp_subscription_id');
  const orderIdColumnExists = await columnExists('api_keys', 'order_id');
  const wpOrderIdColumnExists = await columnExists('api_keys', 'wp_order_id');
  const customerEmailColumnExists = await columnExists('api_keys', 'customer_email');

  const where = [];
  const params = [];

  if (subscription_id) {
    const subscriptionPredicates = [];
    if (subscriptionColumnExists) {
      subscriptionPredicates.push('subscription_id = ?');
      params.push(subscription_id);
    }
    if (wpSubscriptionColumnExists) {
      subscriptionPredicates.push('wp_subscription_id = ?');
      params.push(subscription_id);
    }
    if (subscriptionPredicates.length) {
      where.push(`(${subscriptionPredicates.join(' OR ')})`);
    }
  }

  if (order_id) {
    const orderPredicates = [];
    if (orderIdColumnExists) {
      orderPredicates.push('order_id = ?');
      params.push(order_id);
    }
    if (wpOrderIdColumnExists) {
      orderPredicates.push('wp_order_id = ?');
      params.push(order_id);
    }
    if (orderPredicates.length) {
      where.push(`(${orderPredicates.join(' OR ')})`);
    }
  }

  if (customer_email && customerEmailColumnExists) {
    where.push('(customer_email = ?)');
    params.push(customer_email);
  }

  if (!where.length) return [];

  const [rows] = await executor.execute(
    `SELECT id FROM api_keys WHERE ${where.join(' OR ')}`,
    params
  );

  const unique = new Set(rows.map(row => row.id));
  return Array.from(unique);
}

async function findPlanRow(keyRow) {
  if (!keyRow) return null;

  if (keyRow.plan_id) {
    const [rows] = await pool.execute('SELECT * FROM plans WHERE id = ? LIMIT 1', [keyRow.plan_id]);
    if (rows[0]) return rows[0];
  }

  if (keyRow.plan_slug) {
    const [rows] = await pool.execute('SELECT * FROM plans WHERE plan_slug = ? LIMIT 1', [keyRow.plan_slug]);
    if (rows[0]) return rows[0];
  }

  if (freePlanCache === null) {
    const [rows] = await pool.execute('SELECT * FROM plans WHERE plan_slug = ? LIMIT 1', ['free']);
    freePlanCache = rows[0] || null;
  }

  return freePlanCache;
}

async function findUsageRow(apiKeyId, period) {
  if (!apiKeyId) return null;
  const [rows] = await pool.execute(
    'SELECT * FROM usage_monthly WHERE api_key_id = ? AND period = ? LIMIT 1',
    [apiKeyId, period]
  );
  return rows[0] || null;
}

function normalizeEmail(email) {
  if (typeof email !== 'string') return null;
  const trimmed = email.trim();
  return trimmed ? trimmed.toLowerCase() : null;
}

async function resolveApiKeyIdsForPurge(
  { wp_user_id = null, customer_email = null, subscription_ids = [], order_ids = [] },
  executor = pool
) {
  const ids = new Set();
  const subscriptionIdList = Array.isArray(subscription_ids) ? subscription_ids.filter(Boolean) : [];
  const orderIdList = Array.isArray(order_ids) ? order_ids.filter(Boolean) : [];

  const subscriptionColumnExists = await columnExists('api_keys', 'subscription_id');
  const wpSubscriptionColumnExists = await columnExists('api_keys', 'wp_subscription_id');
  const orderIdColumnExists = await columnExists('api_keys', 'order_id');
  const wpOrderIdColumnExists = await columnExists('api_keys', 'wp_order_id');
  const customerEmailColumnExists = await columnExists('api_keys', 'customer_email');

  if (wp_user_id !== null && wp_user_id !== undefined) {
    const [rows] = await executor.execute('SELECT id FROM api_keys WHERE wp_user_id = ?', [wp_user_id]);
    rows.forEach(row => ids.add(row.id));
  }

  if (customer_email && customerEmailColumnExists) {
    const [rows] = await executor.execute('SELECT id FROM api_keys WHERE customer_email = ?', [customer_email]);
    rows.forEach(row => ids.add(row.id));
  }

  if (subscriptionIdList.length && (subscriptionColumnExists || wpSubscriptionColumnExists)) {
    for (const subId of subscriptionIdList) {
      const predicates = [];
      const params = [];

      if (subscriptionColumnExists) {
        predicates.push('subscription_id = ?');
        params.push(subId);
      }
      if (wpSubscriptionColumnExists) {
        predicates.push('wp_subscription_id = ?');
        params.push(subId);
      }

      if (!predicates.length) continue;

      const [rows] = await executor.execute(
        `SELECT id FROM api_keys WHERE (${predicates.join(' OR ')})`,
        params
      );
      rows.forEach(row => ids.add(row.id));
    }
  }

  if (orderIdList.length && (orderIdColumnExists || wpOrderIdColumnExists)) {
    for (const orderId of orderIdList) {
      const predicates = [];
      const params = [];

      if (orderIdColumnExists) {
        predicates.push('order_id = ?');
        params.push(orderId);
      }
      if (wpOrderIdColumnExists) {
        predicates.push('wp_order_id = ?');
        params.push(orderId);
      }

      if (!predicates.length) continue;

      const [rows] = await executor.execute(
        `SELECT id FROM api_keys WHERE (${predicates.join(' OR ')})`,
        params
      );
      rows.forEach(row => ids.add(row.id));
    }
  }

  return Array.from(ids);
}

const safeNumber = value => (Number.isFinite(Number(value)) ? Number(value) : 0);

function buildUsagePayload(usageRow, period, monthlyQuotaFiles) {

  const totals = {
    used_files: safeNumber(usageRow?.used_files),
    used_bytes: safeNumber(usageRow?.used_bytes),
    total_calls: safeNumber(usageRow?.total_calls),
    total_files_processed: safeNumber(usageRow?.total_files_processed),
    bytes_in: safeNumber(usageRow?.bytes_in),
    bytes_out: safeNumber(usageRow?.bytes_out),
    errors: safeNumber(usageRow?.errors),
  };

  const perEndpoint = {
    h2i: {
      calls: safeNumber(usageRow?.h2i_calls),
      files: safeNumber(usageRow?.h2i_files),
    },
    image: {
      calls: safeNumber(usageRow?.image_calls),
      files: safeNumber(usageRow?.image_files),
    },
    pdf: {
      calls: safeNumber(usageRow?.pdf_calls),
      files: safeNumber(usageRow?.pdf_files),
    },
    tools: {
      calls: safeNumber(usageRow?.tools_calls),
      files: safeNumber(usageRow?.tools_files),
    },
  };

  return {
    period,
    monthly_quota_files: monthlyQuotaFiles ?? null,
    ...totals,
    per_endpoint: perEndpoint,
  };
}

function normalizeEndpointKey(endpoint) {
  if (!endpoint) return null;
  const normalized = endpoint.toLowerCase();
  if (normalized.startsWith('/v1/h2i') || normalized.startsWith('h2i')) return 'h2i';
  if (normalized.startsWith('/v1/image') || normalized.startsWith('image')) return 'image';
  if (normalized.startsWith('/v1/pdf') || normalized.startsWith('pdf')) return 'pdf';
  if (normalized.startsWith('/v1/tools') || normalized.startsWith('tools')) return 'tools';
  return null;
}

function buildZeroSeries(labels) {
  const base = { h2i: [], image: [], pdf: [], tools: [] };
  labels.forEach(() => {
    base.h2i.push(0);
    base.image.push(0);
    base.pdf.push(0);
    base.tools.push(0);
  });
  return base;
}

function buildTotalsFromSeries(series) {
  const length = Math.max(series.h2i.length, series.image.length, series.pdf.length, series.tools.length);
  const totals = [];
  for (let i = 0; i < length; i++) {
    totals.push(
      (series.h2i[i] || 0) + (series.image[i] || 0) + (series.pdf[i] || 0) + (series.tools[i] || 0)
    );
  }
  return totals;
}

function formatUtcHour(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')} ${String(date.getUTCHours()).padStart(2, '0')}:00:00`;
}

function formatUtcDate(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function getMonthlyPeriods(months) {
  const periods = [];
  const now = new Date();
  const current = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() - i, 1));
    periods.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return periods;
}

function buildSeriesResponse(labels, series) {
  return {
    labels,
    series,
    totals: buildTotalsFromSeries(series),
  };
}

async function ensurePlanSchema() {
  if (planSchemaCache.maxDimension !== null) return planSchemaCache.maxDimension;
  try {
    const [rows] = await pool.execute(
      `SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'plans' AND column_name = 'max_dimension_px' LIMIT 1`
    );
    planSchemaCache.maxDimension = rows.length > 0;
  } catch (err) {
    planSchemaCache.maxDimension = false;
  }
  return planSchemaCache.maxDimension;
}

module.exports = function (app) {
  const bridgeToken = process.env.SUBSCRIPTION_BRIDGE_TOKEN || process.env.X_DAVIX_BRIDGE_TOKEN;

  function logRequest(eventName, payload) {
    const base = {
      scope: 'subscription_event',
      event: eventName,
      subscription_id: payload.subscription_id || payload?.['external_' + 'subscription_id'] || null,
      order_id: payload.order_id || null,
      wp_user_id: payload.wp_user_id || null,
      customer_email: payload.customer_email || null,
      plan_id: payload.plan_id || null,
      plan_slug: payload.plan_slug || null,
      subscription_status: payload.subscription_status || null,
    };

    if (debugInternal) {
      base.body_keys = Object.keys(payload || {});
    }

    console.log('[DAVIX][internal] subscription request', base);
  }

  function requireToken(req, res, next) {
    const header = req.headers['x-davix-bridge-token'];
    if (!bridgeToken) {
      console.error('[DAVIX][internal] missing SUBSCRIPTION_BRIDGE_TOKEN env, denying request');
      return sendError(res, 401, 'unauthorized', 'Access denied.');
    }
    if (header !== bridgeToken) {
      console.error('[DAVIX][internal] bridge token mismatch', { expected_header: 'x-davix-bridge-token' });
      return sendError(res, 401, 'unauthorized', 'Access denied.');
    }
    return next();
  }

  function deriveIdentityUsed({ wpUserId = null, customerEmail = null, subscriptionId = null, orderId = null }) {
    if (wpUserId !== null && wpUserId !== undefined) return { type: 'wp_user_id', value: wpUserId };
    if (customerEmail) return { type: 'customer_email', value: customerEmail };
    if (subscriptionId) return { type: 'subscription_id', value: subscriptionId };
    if (orderId) return { type: 'order_id', value: orderId };
    return null;
  }

  app.post('/internal/user/purge', requireToken, async (req, res) => {
    const {
      wp_user_id = null,
      customer_email = null,
      subscription_ids = [],
      order_ids = [],
      reason = null,
    } = req.body || {};

    const normalizedEmail = normalizeEmail(customer_email);
    const hasIdentifiers =
      wp_user_id !== null && wp_user_id !== undefined
        ? true
        : Boolean(normalizedEmail) ||
          (Array.isArray(subscription_ids) && subscription_ids.length > 0) ||
          (Array.isArray(order_ids) && order_ids.length > 0);

    if (!hasIdentifiers) {
      return sendError(res, 400, 'missing_identifier', 'Provide wp_user_id, customer_email, subscription_ids, or order_ids.');
    }

    try {
      const apiKeyIds = await resolveApiKeyIdsForPurge({
        wp_user_id,
        customer_email: normalizedEmail,
        subscription_ids,
        order_ids,
      });

      if (!apiKeyIds.length) {
        return res.json({
          ok: true,
          resolved_api_key_ids: [],
          deleted: { request_log: 0, usage_monthly: 0, api_keys: 0 },
          reason: reason || null,
        });
      }

      const placeholders = apiKeyIds.map(() => '?').join(',');
      const conn = await pool.getConnection();

      let deletedRequestLog = 0;
      let deletedUsage = 0;
      let deletedApiKeys = 0;

      try {
        await conn.beginTransaction();

        const [reqResult] = await conn.query(
          `DELETE FROM request_log WHERE api_key_id IN (${placeholders})`,
          apiKeyIds
        );
        deletedRequestLog = reqResult?.affectedRows || 0;

        const [usageResult] = await conn.query(
          `DELETE FROM usage_monthly WHERE api_key_id IN (${placeholders})`,
          apiKeyIds
        );
        deletedUsage = usageResult?.affectedRows || 0;

        const [keyResult] = await conn.query(`DELETE FROM api_keys WHERE id IN (${placeholders})`, apiKeyIds);
        deletedApiKeys = keyResult?.affectedRows || 0;

        await conn.commit();
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }

      return res.json({
        ok: true,
        resolved_api_key_ids: apiKeyIds,
        deleted: {
          request_log: deletedRequestLog,
          usage_monthly: deletedUsage,
          api_keys: deletedApiKeys,
        },
        reason: reason || null,
      });
    } catch (err) {
      console.error('[DAVIX][internal] purge failed', err);
      return sendError(res, 500, 'internal_error', 'Failed to purge user data.', {
        details: err.message,
      });
    }
  });

  app.post('/internal/user/summary', requireToken, async (req, res) => {
    const { customer_email = null, subscription_id = null, order_id = null } = req.body || {};

    if (!customer_email && !subscription_id && !order_id) {
      return sendError(res, 400, 'missing_identifier', 'Provide subscription_id, customer_email, or order_id.');
    }

    try {
      const { keyRow, identity_used } = await resolveKeyFromIdentifiers({ subscription_id, customer_email, order_id });
      if (!keyRow) {
        return sendError(res, 404, 'not_found', 'No API key found for the provided user.');
      }

      const planRow = await findPlanRow(keyRow);
      const usagePeriod = getUsagePeriodForKey(keyRow, planRow);
      const usageRow = await findUsageRow(keyRow.id, usagePeriod);

      const planSlug = ((planRow && planRow.plan_slug) || keyRow.plan_slug || null)?.toLowerCase() || null;
      const monthlyQuotaFiles = planRow ? planRow.monthly_quota_files : null;
      const validityStart = keyRow.valid_from ? new Date(keyRow.valid_from) : null;
      const validityEnd = keyRow.valid_until ? new Date(keyRow.valid_until) : null;
      const toIsoOrNull = value => {
        const parsed = parseMysqlUtcDatetime(value);
        return parsed ? parsed.toISOString() : null;
      };

      const hasValidityEnd = keyRow.valid_until !== null && keyRow.valid_until !== undefined;
      const isFreePlan = planRow?.is_free === 1 || planRow?.is_free === true || planSlug === 'free' || !hasValidityEnd;
      const { start: startOfMonth, end: startOfNextMonth } = getUtcMonthWindow();
      const billingWindow = {
        start_utc: isFreePlan ? startOfMonth.toISOString() : toIsoOrNull(validityStart),
        end_utc: isFreePlan ? startOfNextMonth.toISOString() : toIsoOrNull(validityEnd),
      };

      const response = {
        status: 'ok',
        identity_used,
        user: {
          customer_email: keyRow.customer_email || customer_email || null,
          subscription_id: keyRow.subscription_id || subscription_id || null,
          order_id: keyRow.order_id || order_id || null,
        },
        plan: {
          plan_slug: planSlug,
          name: planRow ? planRow.name : null,
          monthly_quota_files: monthlyQuotaFiles,
          billing_period: planRow ? planRow.billing_period : null,
        },
        key: {
          key_prefix: keyRow.key_prefix || null,
          key_last4: keyRow.key_last4 || null,
          status: keyRow.status || null,
          created_at: keyRow.created_at || null,
          updated_at: keyRow.updated_at || null,
          valid_from: keyRow.valid_from || null,
          valid_until: keyRow.valid_until || null,
        },
        usage: {
          period: usagePeriod,
          billing_window: billingWindow,
          total_calls: safeNumber(usageRow?.total_calls),
          per_endpoint: {
            h2i_calls: safeNumber(usageRow?.h2i_calls),
            image_calls: safeNumber(usageRow?.image_calls),
            pdf_calls: safeNumber(usageRow?.pdf_calls),
            tools_calls: safeNumber(usageRow?.tools_calls),
          },
        },
      };

      return res.json(response);
    } catch (err) {
      console.error('User summary failed:', err);
      return sendError(res, 500, 'user_summary_failed', 'Failed to load user summary.', {
        details: err.sqlMessage || err.message,
      });
    }
  });

  app.post('/internal/user/logs', requireToken, async (req, res) => {
    const {
      customer_email = null,
      subscription_id = null,
      order_id = null,
      page: rawPage = 1,
      per_page: rawPerPage = 20,
      endpoint = null,
      status: statusFilter = null,
      from = null,
      to = null,
    } = req.body || {};

    if (!customer_email && !subscription_id && !order_id) {
      return sendError(res, 400, 'missing_identifier', 'Provide subscription_id, customer_email, or order_id.');
    }

    const page = Math.max(parseInt(rawPage, 10) || 1, 1);
    const perPage = Math.min(Math.max(parseInt(rawPerPage, 10) || 20, 10), 100);

    try {
      const apiKeyIds = await findApiKeyIdsForIdentity({ subscription_id, customer_email, order_id });
      if (!apiKeyIds.length) {
        return res.json({ status: 'ok', page, per_page: perPage, total: 0, items: [] });
      }

      const where = [];
      const params = [];

      const placeholders = apiKeyIds.map(() => '?').join(', ');
      where.push(`api_key_id IN (${placeholders})`);
      params.push(...apiKeyIds);

      if (endpoint) {
        const normalized = String(endpoint).toLowerCase();
        const endpointMap = {
          h2i: ['h2i%', '/v1/h2i%'],
          image: ['image%', '/v1/image%'],
          pdf: ['pdf%', '/v1/pdf%'],
          tools: ['tools%', '/v1/tools%'],
        };
        const likeValue = endpointMap[normalized];
        if (Array.isArray(likeValue) && likeValue.length) {
          const clauses = likeValue.map(() => 'endpoint LIKE ?').join(' OR ');
          where.push(`(${clauses})`);
          params.push(...likeValue);
        } else if (likeValue) {
          where.push('endpoint LIKE ?');
          params.push(likeValue);
        }
      }

      if (statusFilter !== null && statusFilter !== undefined && statusFilter !== '') {
        const normalizedStatus = String(statusFilter).toLowerCase();
        if (normalizedStatus === 'ok') {
          where.push('status >= 200 AND status < 300');
        } else if (normalizedStatus === 'error') {
          where.push('status >= 400');
        } else if (!Number.isNaN(Number(normalizedStatus))) {
          where.push('status = ?');
          params.push(Number(normalizedStatus));
        }
      }

      const parseDateFilter = value => {
        if (!value) return null;
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 19).replace('T', ' ');
      };

      const fromDate = parseDateFilter(from);
      const toDate = parseDateFilter(to);

      if (fromDate) {
        where.push('timestamp >= ?');
        params.push(fromDate);
      }
      if (toDate) {
        where.push('timestamp <= ?');
        params.push(toDate);
      }

      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

      const [[{ total }]] = await pool.execute(
        `SELECT COUNT(*) as total FROM request_log ${whereSql}`,
        params
      );

      const offset = (page - 1) * perPage;
      const [rows] = await pool.execute(
        `SELECT timestamp, endpoint, action, status, error_code, error_message, files_processed, bytes_in, bytes_out
           FROM request_log
          ${whereSql}
          ORDER BY timestamp DESC
          LIMIT ? OFFSET ?`,
        [...params, perPage, offset]
      );

      const items = rows.map(row => ({
        timestamp: row.timestamp ? new Date(row.timestamp).toISOString() : null,
        endpoint: row.endpoint || null,
        action: row.action || null,
        status: row.status,
        error_code: row.error_code || null,
        error_message: row.error_message || null,
        files_processed: row.files_processed || 0,
        bytes_in: row.bytes_in || 0,
        bytes_out: row.bytes_out || 0,
      }));

      return res.json({ status: 'ok', page, per_page: perPage, total, items });
    } catch (err) {
      console.error('User logs failed:', err);
      return sendError(res, 500, 'user_logs_failed', 'Failed to load user request logs.', {
        details: err.sqlMessage || err.message,
      });
    }
  });

  app.post('/internal/user/usage', requireToken, async (req, res) => {
    const { customer_email = null, subscription_id = null, order_id = null, range = 'daily', window = {} } = req.body || {};

    if (!customer_email && !subscription_id && !order_id) {
      return sendError(res, 400, 'missing_identifier', 'Provide subscription_id, customer_email, or order_id.');
    }

    const normalizedRange = String(range || 'daily').toLowerCase();

    try {
      const { keyRow, identity_used } = await resolveKeyFromIdentifiers({ subscription_id, customer_email, order_id });
      if (!keyRow) {
        return sendError(res, 404, 'not_found', 'No API key found for the provided user.');
      }

      const apiKeyId = keyRow.id;
      const now = new Date();
      let labels = [];
      let series = {};

      if (normalizedRange === 'hourly') {
        const hours = Math.max(1, Math.min(336, Number(window.hours) || 48));
        const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours(), 0, 0));
        start.setUTCHours(start.getUTCHours() - (hours - 1));

        for (let i = 0; i < hours; i++) {
          const bucketDate = new Date(start.getTime() + i * 60 * 60 * 1000);
          labels.push(formatUtcHour(bucketDate));
        }

        const [rows] = await pool.execute(
          `SELECT DATE_FORMAT(timestamp, '%Y-%m-%d %H:00:00') as bucket, endpoint
             FROM request_log
            WHERE api_key_id = ? AND timestamp >= ?
            ORDER BY bucket ASC`,
          [apiKeyId, start.toISOString().slice(0, 19).replace('T', ' ')]
        );

        const bucketMap = new Map();
        rows.forEach(row => {
          const endpointKey = normalizeEndpointKey(row.endpoint || '');
          if (!endpointKey) return;
          if (!bucketMap.has(row.bucket)) {
            bucketMap.set(row.bucket, { h2i: 0, image: 0, pdf: 0, tools: 0 });
          }
          const bucketCounts = bucketMap.get(row.bucket);
          bucketCounts[endpointKey] += 1;
        });

        series = buildZeroSeries(labels);
        labels.forEach((label, idx) => {
          const counts = bucketMap.get(label);
          if (counts) {
            series.h2i[idx] = counts.h2i || 0;
            series.image[idx] = counts.image || 0;
            series.pdf[idx] = counts.pdf || 0;
            series.tools[idx] = counts.tools || 0;
          }
        });
      } else if (normalizedRange === 'daily' || normalizedRange === 'billing_period') {
        const days = Math.max(1, Math.min(366, Number(window.days) || 30));
        const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
        if (normalizedRange === 'billing_period') {
          start.setUTCDate(1);
        } else {
          start.setUTCDate(start.getUTCDate() - (days - 1));
        }

        const totalDays = normalizedRange === 'billing_period'
          ? Math.floor((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - start.getTime()) / (24 * 60 * 60 * 1000)) + 1
          : days;

        for (let i = 0; i < totalDays; i++) {
          const bucketDate = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
          labels.push(formatUtcDate(bucketDate));
        }

        const [rows] = await pool.execute(
          `SELECT DATE(timestamp) as bucket, endpoint
             FROM request_log
            WHERE api_key_id = ? AND timestamp >= ?
            ORDER BY bucket ASC`,
          [apiKeyId, start.toISOString().slice(0, 19).replace('T', ' ')]
        );

        const bucketMap = new Map();
        rows.forEach(row => {
          const endpointKey = normalizeEndpointKey(row.endpoint || '');
          if (!endpointKey) return;
          if (!bucketMap.has(row.bucket)) {
            bucketMap.set(row.bucket, { h2i: 0, image: 0, pdf: 0, tools: 0 });
          }
          const bucketCounts = bucketMap.get(row.bucket);
          bucketCounts[endpointKey] += 1;
        });

        series = buildZeroSeries(labels);
        labels.forEach((label, idx) => {
          const counts = bucketMap.get(label);
          if (counts) {
            series.h2i[idx] = counts.h2i || 0;
            series.image[idx] = counts.image || 0;
            series.pdf[idx] = counts.pdf || 0;
            series.tools[idx] = counts.tools || 0;
          }
        });
      } else if (normalizedRange === 'monthly') {
        const months = Math.max(1, Math.min(36, Number(window.months) || 6));
        labels = getMonthlyPeriods(months);
        series = buildZeroSeries(labels);

        if (labels.length) {
          const placeholders = labels.map(() => '?').join(', ');
          const [rows] = await pool.execute(
            `SELECT period, h2i_calls, image_calls, pdf_calls, tools_calls, total_calls
               FROM usage_monthly
              WHERE api_key_id = ? AND period IN (${placeholders})
              ORDER BY period ASC`,
            [apiKeyId, ...labels]
          );

          const byPeriod = new Map();
          rows.forEach(row => {
            byPeriod.set(row.period, {
              h2i: safeNumber(row.h2i_calls),
              image: safeNumber(row.image_calls),
              pdf: safeNumber(row.pdf_calls),
              tools: safeNumber(row.tools_calls),
            });
          });

          labels.forEach((label, idx) => {
            const counts = byPeriod.get(label);
            if (counts) {
              series.h2i[idx] = counts.h2i;
              series.image[idx] = counts.image;
              series.pdf[idx] = counts.pdf;
              series.tools[idx] = counts.tools;
            }
          });
        }
      } else {
        return sendError(res, 400, 'invalid_range', 'Range must be hourly, daily, monthly, or billing_period.');
      }

      const response = {
        status: 'ok',
        range: normalizedRange,
        identity_used,
        ...buildSeriesResponse(labels, series),
      };

      return res.json(response);
    } catch (err) {
      console.error('User usage failed:', err);
      return sendError(res, 500, 'user_usage_failed', 'Failed to load usage.', {
        details: err.sqlMessage || err.message,
      });
    }
  });

  app.post('/internal/subscription/event', requireToken, async (req, res) => {
    const payload = req.body || {};
    const {
      event,
      status,
      customer_email,
      customer_name,
      plan_slug,
      plan_id,
      subscription_id,
      order_id,
      wp_user_id,
      subscription_status,
    } = payload;

    logRequest(event || status, payload);

    const subscriptionId = subscription_id || payload?.['external_' + 'subscription_id'] || null;
    const wpUserId = wp_user_id !== undefined && wp_user_id !== null && wp_user_id !== '' ? Number(wp_user_id) : null;
    const normalizedEmail = customer_email ? String(customer_email).trim().toLowerCase() : null;

    if (wpUserId !== null && !Number.isFinite(wpUserId)) {
      console.error('[DAVIX][internal] invalid wp_user_id', { wp_user_id });
      return sendError(res, 400, 'invalid_parameter', 'wp_user_id must be a numeric value.');
    }

    const hasIdentifier = wpUserId !== null || normalizedEmail || subscriptionId || (order_id != null);

    const normalizedEvent = String(event || status || '').trim().toLowerCase();
    const activationEvents = ['activated', 'renewed', 'active', 'reactivated'];
    const disableEvents = ['cancelled', 'expired', 'payment_failed', 'paused', 'disabled'];
    const isLifetime = payload.pmpro_is_lifetime === true || payload.is_lifetime === true;

    try {
      if (activationEvents.includes(normalizedEvent)) {
        if (!plan_slug && !plan_id) {
          console.error('[DAVIX][internal] activation missing plan', { plan_slug, plan_id });
          return sendError(res, 400, 'missing_plan', 'plan_slug or plan_id is required for activation events.');
        }

        if (!hasIdentifier) {
          console.error('[DAVIX][internal] activation missing identifier');
          return sendError(
            res,
            400,
            'missing_identifier',
            'wp_user_id, customer_email, subscription_id, or order_id is required.'
          );
        }

        const fromInput = payload.valid_from ?? payload.validFrom;
        const untilInput = payload.valid_until ?? payload.validUntil;

        const parsedFrom = parseISO8601(fromInput);
        const parsedUntil = parseISO8601(untilInput);
        if (parsedFrom.error) {
          console.error('[DAVIX][internal] invalid valid_from', { valid_from: fromInput });
          return sendError(res, 400, 'invalid_parameter', 'valid_from must be a valid ISO8601 date.');
        }
        if (parsedUntil.error) {
          console.error('[DAVIX][internal] invalid valid_until', { valid_until: untilInput });
          return sendError(res, 400, 'invalid_parameter', 'valid_until must be a valid ISO8601 date.');
        }

        if (!isLifetime && parsedUntil.provided === false) {
          console.error('[DAVIX][internal] activation missing valid_until', {
            event: normalizedEvent,
            isLifetime,
            valid_until_provided: parsedUntil.provided,
          });
          return sendError(res, 400, 'invalid_parameter', 'valid_until is required for non-lifetime activation events.');
        }

        const result = await activateOrProvisionKey({
          wpUserId: wpUserId || null,
          customerEmail: normalizedEmail || null,
          customerName: customer_name || null,
          subscriptionStatus: subscription_status || null,
          planId: plan_id || null,
          planSlug: plan_slug || null,
          subscriptionId,
          orderId: order_id || null,
          manualValidFrom: parsedFrom.date || null,
          validUntil: parsedUntil.date || null,
          providedValidFrom: parsedFrom.provided,
          providedValidUntil: parsedUntil.provided,
          forceImmediateValidFrom: true,
          isLifetime,
        });

        return res.json({
          status: 'ok',
          action: result.created ? 'created' : 'updated',
          key: result.plaintextKey || null,
          key_prefix: result.keyPrefix,
          key_last4: result.keyLast4 || (result.plaintextKey ? result.plaintextKey.slice(-4) : null),
          api_key_id: result.apiKeyId || null,
          identity_used: result.identityUsed || deriveIdentityUsed({
            wpUserId,
            customerEmail: normalizedEmail,
            subscriptionId,
            orderId: order_id || null,
          }),
          key_status: 'active',
          wp_user_id: result.wpUserId || null,
          customer_email: normalizedEmail || null,
          customer_name: result.customerName || null,
          subscription_status: result.subscriptionStatus || null,
          plan_id: result.planId,
          subscription_id: subscriptionId || null,
          order_id: order_id || null,
          valid_from: result.validFrom || null,
          valid_until: result.validUntil || null,
        });
      }

      if (disableEvents.includes(normalizedEvent)) {
        if (!hasIdentifier) {
          console.error('[DAVIX][internal] disable missing identifier');
          return sendError(
            res,
            400,
            'missing_identifier',
            'wp_user_id, customer_email, subscription_id, or order_id is required.'
          );
        }

        const untilInput = payload.valid_until ?? payload.validUntil;
        const parsedUntil = parseISO8601(untilInput);
        if (parsedUntil.error) {
          console.error('[DAVIX][internal] invalid valid_until', { valid_until: untilInput });
          return sendError(res, 400, 'invalid_parameter', 'valid_until must be a valid ISO8601 date.');
        }

        const result = await applySubscriptionStateChange({
          event: normalizedEvent,
          subscriptionStatus: subscription_status || null,
          customerEmail: normalizedEmail || null,
          wpUserId: wpUserId || null,
          subscriptionId,
          orderId: order_id || null,
          validUntil: parsedUntil.date || null,
          providedValidUntil: parsedUntil.provided,
        });

        return res.json({
          status: 'ok',
          action: result.action,
          affected: result.affected,
          identity_used:
            result.identityUsed ||
            deriveIdentityUsed({
              wpUserId,
              customerEmail: normalizedEmail,
              subscriptionId,
              orderId: order_id || null,
            }),
          wp_user_id: wpUserId || null,
          customer_email: normalizedEmail || null,
          subscription_id: subscriptionId || null,
          order_id: order_id || null,
          subscription_status: result.subscriptionStatus ?? subscription_status ?? null,
          key_status: result.status || null,
          api_key_id: result.apiKeyId || null,
          valid_until: result.validUntil || null,
        });
      }

      return sendError(res, 400, 'unsupported_event', 'The provided event is not supported.', {
        supported: [...activationEvents, ...disableEvents],
      });
    } catch (err) {
      console.error('Subscription event failed:', {
        error: err.message,
        code: err.code,
        event: normalizedEvent,
        subscription_id: subscriptionId || null,
        wp_user_id: wpUserId || null,
        customer_email: normalizedEmail || null,
        sql_message: err.sqlMessage || null,
      });
      if (err.code === 'PLAN_NOT_FOUND') {
        return sendError(res, 400, 'plan_not_found', err.message, { details: err.message });
      }
      if (err.code === 'INVALID_PARAMETER') {
        return sendError(res, 400, 'invalid_parameter', err.message || 'Invalid validity window.');
      }
      return sendError(res, 500, 'internal_error', 'Failed to process subscription event.', {
        details: err.sqlMessage || err.message,
      });
    }
  });

  // Upsert or sync a plan sent from WordPress
  app.post('/internal/wp-sync/plan', requireToken, async (req, res) => {
    const {
      plan_slug,
      name = null,
      billing_period = null,
      monthly_quota_files = null,
      max_files_per_request = null,
      max_total_upload_mb = null,
      max_dimension_px = null,
      timeout_seconds = null,
      allow_h2i = null,
      allow_image = null,
      allow_pdf = null,
      allow_tools = null,
      is_free = null,
      description = null,
    } = req.body || {};

    const planSlug = (plan_slug || '').trim();
    if (!planSlug) {
      return sendError(res, 400, 'missing_plan_slug', 'plan_slug is required.');
    }

    const includeMaxDimension = await ensurePlanSchema();

    const columns = [
      'plan_slug',
      'name',
      'billing_period',
      'monthly_quota_files',
      'max_files_per_request',
      'max_total_upload_mb',
      'timeout_seconds',
      'allow_h2i',
      'allow_image',
      'allow_pdf',
      'allow_tools',
      'is_free',
      'description',
    ];

    const values = [
      planSlug,
      name,
      billing_period,
      monthly_quota_files,
      max_files_per_request,
      max_total_upload_mb,
      timeout_seconds,
      allow_h2i,
      allow_image,
      allow_pdf,
      allow_tools,
      is_free,
      description,
    ];

    if (includeMaxDimension) {
      columns.splice(6, 0, 'max_dimension_px');
      values.splice(6, 0, max_dimension_px);
    }

    const setClause = columns
      .filter(col => col !== 'plan_slug')
      .map(col => `${col} = VALUES(${col})`)
      .join(', ');

    const placeholders = columns.map(() => '?').join(', ');

    try {
      await pool.execute(
        `INSERT INTO plans (${columns.join(', ')}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${setClause}`,
        values
      );
      return res.json({ status: 'ok', action: 'upserted', plan_slug: planSlug });
    } catch (err) {
      console.error('Plan sync failed:', err);
      return sendError(res, 500, 'plan_sync_failed', 'Failed to sync plan.', {
        details: err.sqlMessage || err.message,
      });
    }
  });

  // List plans for admin dropdowns
  app.get('/internal/admin/plans', requireToken, async (req, res) => {
    try {
      const [rows] = await pool.execute(
        `SELECT id, plan_slug, name, monthly_quota_files, billing_period, is_free FROM plans ORDER BY id ASC`
      );
      return res.json({ status: 'ok', items: rows });
    } catch (err) {
      console.error('List plans failed:', err);
      return sendError(res, 500, 'plans_list_failed', 'Failed to list plans.', {
        details: err.sqlMessage || err.message,
      });
    }
  });

  // List API keys for admin with pagination and search
  app.get('/internal/admin/keys', requireToken, async (req, res) => {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const perPageRaw = parseInt(req.query.per_page, 10) || 20;
    const perPage = Math.min(Math.max(perPageRaw, 1), 100);
    const search = (req.query.search || '').trim();

    const where = [];
    const params = [];
    if (search) {
      where.push('(ak.customer_email LIKE ? OR ak.subscription_id LIKE ? OR ak.key_prefix LIKE ?)');
      const term = `%${search}%`;
      params.push(term, term, term);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    try {
      const [[{ total }]] = await pool.execute(
        `SELECT COUNT(*) as total FROM api_keys ak ${whereSql}`,
        params
      );

      const offset = (page - 1) * perPage;
      const [rows] = await pool.execute(
        `SELECT ak.subscription_id, ak.customer_email, ak.status, ak.key_prefix, ak.key_last4, ak.updated_at, ak.valid_from, ak.valid_until, p.plan_slug
           FROM api_keys ak
           LEFT JOIN plans p ON ak.plan_id = p.id
          ${whereSql}
          ORDER BY ak.updated_at DESC
          LIMIT ? OFFSET ?`,
        [...params, perPage, offset]
      );

      return res.json({ status: 'ok', items: rows, total, page, per_page: perPage });
    } catch (err) {
      console.error('List keys failed:', err);
      return sendError(res, 500, 'keys_list_failed', 'Failed to list keys.', {
        details: err.sqlMessage || err.message,
      });
    }
  });

  // Export API keys with pagination and rich plan data (read-only)
  app.get('/internal/admin/keys/export', requireToken, async (req, res) => {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const perPageRaw = parseInt(req.query.per_page, 10) || 200;
    const perPage = Math.min(Math.max(perPageRaw, 1), 500);
    const search = (req.query.search || '').trim();
    const updatedAfterRaw = req.query.updated_after || null;

    let updatedAfter = null;
    if (updatedAfterRaw) {
      const parsedUpdatedAfter = parseISO8601(updatedAfterRaw);
      if (parsedUpdatedAfter.error || !parsedUpdatedAfter.date) {
        return sendError(res, 400, 'invalid_parameter', 'updated_after must be a valid ISO8601 date.');
      }
      updatedAfter = parsedUpdatedAfter.date;
    }

    const where = [];
    const params = [];

    if (search) {
      where.push('(ak.customer_email LIKE ? OR ak.subscription_id LIKE ? OR ak.key_prefix LIKE ?)');
      const term = `%${search}%`;
      params.push(term, term, term);
    }

    if (updatedAfter) {
      where.push('ak.updated_at > ?');
      params.push(updatedAfter.toISOString().slice(0, 19).replace('T', ' '));
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    try {
      const [[{ total }]] = await pool.execute(`SELECT COUNT(*) as total FROM api_keys ak ${whereSql}`, params);

      const offset = (page - 1) * perPage;
      const [rows] = await pool.execute(
        `SELECT
            ak.id AS api_key_id,
            ak.wp_user_id,
            ak.customer_email,
            ak.customer_name,
            ak.subscription_id,
            ak.order_id,
            ak.status,
            ak.subscription_status,
            ak.key_prefix,
            ak.key_last4,
            ak.valid_from,
            ak.valid_until,
            ak.created_at,
            ak.updated_at,
            p.id AS plan_id,
            p.plan_slug,
            p.name AS plan_name,
            p.billing_period,
            p.is_free,
            p.monthly_quota_files,
            p.max_files_per_request,
            p.max_total_upload_mb,
            p.timeout_seconds,
            p.allow_h2i,
            p.allow_image,
            p.allow_pdf,
            p.allow_tools
           FROM api_keys ak
           LEFT JOIN plans p ON ak.plan_id = p.id
          ${whereSql}
          ORDER BY ak.updated_at DESC
          LIMIT ? OFFSET ?`,
        [...params, perPage, offset]
      );

      const items = rows.map(row => ({
        api_key_id: row.api_key_id,
        wp_user_id: row.wp_user_id,
        customer_email: row.customer_email,
        customer_name: row.customer_name,
        subscription_id: row.subscription_id,
        order_id: row.order_id,
        status: row.status,
        subscription_status: row.subscription_status,
        key_prefix: row.key_prefix,
        key_last4: row.key_last4,
        valid_from: row.valid_from,
        valid_until: row.valid_until,
        created_at: row.created_at,
        updated_at: row.updated_at,
        plan: {
          plan_id: row.plan_id,
          plan_slug: row.plan_slug,
          name: row.plan_name,
          billing_period: row.billing_period,
          is_free: row.is_free,
          monthly_quota_files: row.monthly_quota_files,
          max_files_per_request: row.max_files_per_request,
          max_total_upload_mb: row.max_total_upload_mb,
          timeout_seconds: row.timeout_seconds,
          allow_h2i: row.allow_h2i,
          allow_image: row.allow_image,
          allow_pdf: row.allow_pdf,
          allow_tools: row.allow_tools,
        },
      }));

      const totalPages = perPage > 0 ? Math.ceil(total / perPage) : 0;

      return res.json({
        status: 'ok',
        page,
        per_page: perPage,
        total,
        total_pages: totalPages,
        items,
      });
    } catch (err) {
      console.error('Export keys failed:', err);
      return sendError(res, 500, 'keys_export_failed', 'Failed to export keys.', {
        details: err.sqlMessage || err.message,
      });
    }
  });

  // Provision or activate a key manually from admin
  app.post('/internal/admin/key/provision', requireToken, async (req, res) => {
    const { customer_email = null, plan_slug = null, subscription_id = null, order_id = null, wp_user_id = null } =
      req.body || {};

    const wpUserId = wp_user_id !== undefined && wp_user_id !== null && wp_user_id !== '' ? Number(wp_user_id) : null;

    if (wpUserId !== null && !Number.isFinite(wpUserId)) {
      return sendError(res, 400, 'invalid_parameter', 'wp_user_id must be a numeric value.');
    }

    const validity = parseAdminValidityWindow(req.body || {});
    if (validity.error) {
      return sendError(res, 400, 'invalid_parameter', validity.message);
    }

    if (!plan_slug) {
      return sendError(res, 400, 'missing_plan', 'plan_slug is required.');
    }

    try {
      const result = await activateOrProvisionKey({
        customerEmail: customer_email || null,
        planSlug: plan_slug || null,
        subscriptionId: subscription_id || null,
        orderId: order_id || null,
        wpUserId,
        manualValidFrom: validity.validFrom,
        validUntil: validity.validUntil,
        providedValidFrom: validity.providedValidFrom,
        providedValidUntil: validity.providedValidUntil,
      });

      return res.json({
        status: 'ok',
        action: result.created ? 'created' : 'updated',
        key: result.plaintextKey || null,
        key_prefix: result.keyPrefix,
        key_last4: result.keyLast4 || (result.plaintextKey ? result.plaintextKey.slice(-4) : null),
        plan_id: result.planId,
        subscription_id: subscription_id || null,
        valid_from: result.validFrom || null,
        valid_until: result.validUntil || null,
      });
    } catch (err) {
      console.error('Provision key failed:', err);
      if (err.code === 'PLAN_NOT_FOUND') {
        return sendError(res, 400, 'plan_not_found', err.message, { details: err.message });
      }
      if (err.code === 'INVALID_PARAMETER') {
        return sendError(res, 400, 'invalid_parameter', err.message || 'Invalid validity window.');
      }
      return sendError(res, 500, 'provision_failed', 'Failed to provision key.', {
        details: err.sqlMessage || err.message,
      });
    }
  });

  // Disable a key via admin
  app.post('/internal/admin/key/disable', requireToken, async (req, res) => {
    const { subscription_id = null, customer_email = null, wp_user_id = null } = req.body || {};

    const wpUserId = wp_user_id !== undefined && wp_user_id !== null && wp_user_id !== '' ? Number(wp_user_id) : null;

    if (wpUserId !== null && !Number.isFinite(wpUserId)) {
      return sendError(res, 400, 'invalid_parameter', 'wp_user_id must be a numeric value.');
    }

    if (!subscription_id && !customer_email && !wpUserId) {
      return sendError(res, 400, 'missing_identifier', 'subscription_id, customer_email, or wp_user_id is required.');
    }

    try {
      const affected = await disableCustomerKey({
        subscriptionId: subscription_id || null,
        customerEmail: customer_email || null,
        wpUserId: wpUserId || null,
      });
      return res.json({ status: 'ok', action: 'disabled', affected });
    } catch (err) {
      console.error('Disable key failed:', err);
      return sendError(res, 500, 'disable_failed', 'Failed to disable key.', {
        details: err.sqlMessage || err.message,
      });
    }
  });

  // Rotate a key and return the plaintext once
  app.post('/internal/admin/key/rotate', requireToken, async (req, res) => {
    const { subscription_id = null, customer_email = null } = req.body || {};

    if (!subscription_id && !customer_email) {
      return sendError(res, 400, 'missing_identifier', 'subscription_id or customer_email is required.');
    }

    try {
      const conn = await pool.getConnection();
      let identifierField = null;
      let identifierValue = null;
      if (subscription_id) {
        identifierField = 'subscription_id';
        identifierValue = subscription_id;
      } else {
        identifierField = 'customer_email';
        identifierValue = customer_email;
      }

      try {
        await conn.beginTransaction();
        const [rows] = await conn.execute(
          `SELECT id FROM api_keys WHERE ${identifierField} = ? ORDER BY updated_at DESC LIMIT 1`,
          [identifierValue]
        );

        if (!rows.length) {
          await conn.rollback();
          return sendError(res, 404, 'not_found', 'Key not found for rotation.');
        }

        const { plaintextKey, prefix, keyHash } = await generateApiKey();
        await conn.execute(
          `UPDATE api_keys SET key_prefix = ?, key_hash = ?, key_last4 = ?, rotated_at = NOW(), updated_at = NOW(), license_key = NULL WHERE id = ?`,
          [prefix, keyHash, plaintextKey.slice(-4), rows[0].id]
        );

        await conn.commit();
        return res.json({
          status: 'ok',
          action: 'rotated',
          key: plaintextKey,
          key_prefix: prefix,
          key_last4: plaintextKey.slice(-4),
          subscription_id: subscription_id || null,
        });
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
    } catch (err) {
      console.error('Rotate key failed:', err);
      return sendError(res, 500, 'rotate_failed', 'Failed to rotate key.', {
        details: err.sqlMessage || err.message,
      });
    }
  });

  app.post('/internal/user/key/rotate', requireToken, async (req, res) => {
    const { subscription_id = null, customer_email = null, order_id = null } = req.body || {};

    if (!subscription_id && !customer_email && !order_id) {
      return sendError(res, 400, 'missing_identifier', 'Provide subscription_id, customer_email, or order_id.');
    }

    let conn = null;

    try {
      conn = await pool.getConnection();
      await conn.beginTransaction();

      const { keyRow, identity_used } = await resolveKeyFromIdentifiers({ subscription_id, customer_email, order_id }, conn);
      if (!keyRow) {
        await conn.rollback();
        return sendError(res, 404, 'not_found', 'Key not found for rotation.');
      }

      const { plaintextKey, prefix, keyHash } = await generateApiKey();
      const hasRotatedAt = await columnExists('api_keys', 'rotated_at');

      const updateFields = [
        'key_prefix = ?',
        'key_hash = ?',
        'key_last4 = ?',
        'updated_at = NOW()',
        'license_key = NULL',
      ];
      const params = [prefix, keyHash, plaintextKey.slice(-4)];

      if (hasRotatedAt) {
        updateFields.push('rotated_at = NOW()');
      }

      await conn.execute(`UPDATE api_keys SET ${updateFields.join(', ')} WHERE id = ?`, [...params, keyRow.id]);

      await conn.commit();
      return res.json({
        status: 'ok',
        action: 'rotated',
        identity_used,
        key: plaintextKey,
        key_prefix: prefix,
        key_last4: plaintextKey.slice(-4),
        subscription_id: keyRow.subscription_id || null,
        order_id: keyRow.order_id || null,
      });
    } catch (err) {
      if (conn) {
        try {
          await conn.rollback();
        } catch (rollbackErr) {
          console.error('Rollback failed:', rollbackErr);
        }
      }
      console.error('User key rotation failed:', err);
      return sendError(res, 500, 'user_rotate_failed', 'Failed to rotate key.', {
        details: err.sqlMessage || err.message,
      });
    } finally {
      if (conn) conn.release();
    }
  });

  app.post('/internal/user/key/toggle', requireToken, async (req, res) => {
    const { subscription_id = null, customer_email = null, order_id = null, action = null } = req.body || {};

    if (!subscription_id && !customer_email && !order_id) {
      return sendError(res, 400, 'missing_identifier', 'Provide subscription_id, customer_email, or order_id.');
    }

    const normalizedAction = String(action || '').toLowerCase();
    if (!['enable', 'disable'].includes(normalizedAction)) {
      return sendError(res, 400, 'invalid_action', 'Action must be enable or disable.');
    }

    try {
      const { keyRow, identity_used } = await resolveKeyFromIdentifiers({ subscription_id, customer_email, order_id });
      if (!keyRow) {
        return sendError(res, 404, 'not_found', 'Key not found for toggle.');
      }

      const newStatus = normalizedAction === 'enable' ? 'active' : 'disabled';
      await pool.execute('UPDATE api_keys SET status = ?, updated_at = NOW() WHERE id = ?', [newStatus, keyRow.id]);

      return res.json({
        status: 'ok',
        action: normalizedAction,
        identity_used,
        new_status: newStatus,
        subscription_id: keyRow.subscription_id || null,
        order_id: keyRow.order_id || null,
      });
    } catch (err) {
      console.error('User key toggle failed:', err);
      return sendError(res, 500, 'user_toggle_failed', 'Failed to toggle key status.', {
        details: err.sqlMessage || err.message,
      });
    }
  });

  app.get('/internal/subscription/debug', requireToken, async (req, res) => {
    const debug = {
      tokenConfigured: Boolean(bridgeToken),
      dbConnected: false,
      plans: [],
    };

    try {
      const [rows] = await pool.execute('SELECT plan_slug FROM plans ORDER BY id ASC');
      debug.dbConnected = true;
      debug.plans = rows.map(r => r.plan_slug);
    } catch (err) {
      return sendError(res, 500, 'debug_error', 'Failed to query database.', {
        details: err.sqlMessage || err.message,
      });
    }

    return res.json({ status: 'ok', debug });
  });
};
