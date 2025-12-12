const { sendError } = require('../utils/errorResponse');
const { activateOrProvisionKey, disableCustomerKey } = require('../utils/customerKeys');
const { generateApiKey } = require('../utils/apiKeys');
const { pool } = require('../db');

let planSchemaCache = { maxDimension: null };
let columnExistsCache = {};

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

function getPeriodUTC() {
  const now = new Date();
  return now.toISOString().slice(0, 7);
}

async function findKeyRow(identifierField, identifierValue, executor = pool) {
  const [rows] = await executor.execute(
    `SELECT * FROM api_keys WHERE ${identifierField} = ? ORDER BY updated_at DESC LIMIT 1`,
    [identifierValue]
  );
  return rows[0] || null;
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

  return null;
}

async function findUsageRow(apiKeyId, period) {
  if (!apiKeyId) return null;
  const [rows] = await pool.execute(
    'SELECT * FROM usage_monthly WHERE api_key_id = ? AND period = ? LIMIT 1',
    [apiKeyId, period]
  );
  return rows[0] || null;
}

function buildUsagePayload(usageRow, period, monthlyQuotaFiles) {
  const safeNumber = value => (Number.isFinite(Number(value)) ? Number(value) : 0);

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

  function requireToken(req, res, next) {
    const header = req.headers['x-davix-bridge-token'];
    if (!bridgeToken || header !== bridgeToken) {
      return sendError(res, 401, 'unauthorized', 'Access denied.');
    }
    return next();
  }

  app.post('/internal/user/summary', requireToken, async (req, res) => {
    const { customer_email = null, subscription_id = null } = req.body || {};

    if (!customer_email && !subscription_id) {
      return sendError(res, 400, 'missing_identifier', 'customer_email or subscription_id is required.');
    }

    const identifierField = subscription_id ? 'subscription_id' : 'customer_email';
    const identifierValue = subscription_id || customer_email;

    try {
      const keyRow = await findKeyRow(identifierField, identifierValue);
      if (!keyRow) {
        return sendError(res, 404, 'not_found', 'No API key found for the provided user.');
      }

      const planRow = await findPlanRow(keyRow);
      const period = getPeriodUTC();
      const usageRow = await findUsageRow(keyRow.id, period);

      const planSlug = (planRow && planRow.plan_slug) || keyRow.plan_slug || null;
      const monthlyQuotaFiles = planRow ? planRow.monthly_quota_files : null;

      const response = {
        status: 'ok',
        user: {
          customer_email: keyRow.customer_email || null,
          subscription_id: keyRow.subscription_id || null,
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
        },
        usage: buildUsagePayload(usageRow, period, monthlyQuotaFiles),
      };

      return res.json(response);
    } catch (err) {
      console.error('User summary failed:', err);
      return sendError(res, 500, 'user_summary_failed', 'Failed to load user summary.', {
        details: err.sqlMessage || err.message,
      });
    }
  });

  app.post('/internal/subscription/event', requireToken, async (req, res) => {
    const {
      event,
      customer_email,
      plan_slug,
      plan_id,
      external_subscription_id,
      subscription_id,
      order_id,
      status,
    } = req.body || {};

    const subscriptionId = subscription_id || external_subscription_id || null;

    if (!customer_email && !subscriptionId) {
      return sendError(res, 400, 'missing_field', 'customer_email or subscription_id is required.');
    }

    const normalizedEvent = String(event || status || '').trim().toLowerCase();
    const activationEvents = ['activated', 'renewed', 'active', 'reactivated'];
    const disableEvents = ['cancelled', 'expired', 'payment_failed', 'paused', 'disabled'];

    try {
      if (activationEvents.includes(normalizedEvent)) {
        if (!plan_slug && !plan_id) {
          return sendError(res, 400, 'missing_plan', 'plan_slug or plan_id is required for activation events.');
        }

        const result = await activateOrProvisionKey({
          customerEmail: customer_email || null,
          planId: plan_id || null,
          planSlug: plan_slug || null,
          subscriptionId,
          orderId: order_id || null,
        });

        return res.json({
          status: 'ok',
          action: result.created ? 'created' : 'updated',
          key: result.plaintextKey || null,
          key_prefix: result.keyPrefix,
          plan_id: result.planId,
          subscription_id: subscriptionId,
        });
      }

      if (disableEvents.includes(normalizedEvent)) {
        const affected = await disableCustomerKey({
          customerEmail: customer_email || null,
          subscriptionId,
        });

        return res.json({ status: 'ok', action: 'disabled', affected });
      }

      return sendError(res, 400, 'unsupported_event', 'The provided event is not supported.', {
        supported: [...activationEvents, ...disableEvents],
      });
    } catch (err) {
      console.error('Subscription event failed:', err);
      if (err.code === 'PLAN_NOT_FOUND') {
        return sendError(res, 400, 'plan_not_found', err.message, { details: err.message });
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
        `SELECT ak.subscription_id, ak.customer_email, ak.status, ak.key_prefix, ak.key_last4, ak.updated_at, p.plan_slug
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

  // Provision or activate a key manually from admin
  app.post('/internal/admin/key/provision', requireToken, async (req, res) => {
    const { customer_email = null, plan_slug = null, subscription_id = null, order_id = null } = req.body || {};

    if (!plan_slug) {
      return sendError(res, 400, 'missing_plan', 'plan_slug is required.');
    }

    try {
      const result = await activateOrProvisionKey({
        customerEmail: customer_email || null,
        planSlug: plan_slug || null,
        subscriptionId: subscription_id || null,
        orderId: order_id || null,
      });

      return res.json({
        status: 'ok',
        action: result.created ? 'created' : 'updated',
        key: result.plaintextKey || null,
        key_prefix: result.keyPrefix,
        key_last4: result.keyLast4 || (result.plaintextKey ? result.plaintextKey.slice(-4) : null),
        plan_id: result.planId,
        subscription_id: subscription_id || null,
      });
    } catch (err) {
      console.error('Provision key failed:', err);
      if (err.code === 'PLAN_NOT_FOUND') {
        return sendError(res, 400, 'plan_not_found', err.message, { details: err.message });
      }
      return sendError(res, 500, 'provision_failed', 'Failed to provision key.', {
        details: err.sqlMessage || err.message,
      });
    }
  });

  // Disable a key via admin
  app.post('/internal/admin/key/disable', requireToken, async (req, res) => {
    const { subscription_id = null, customer_email = null } = req.body || {};

    if (!subscription_id && !customer_email) {
      return sendError(res, 400, 'missing_identifier', 'subscription_id or customer_email is required.');
    }

    try {
      const affected = await disableCustomerKey({
        subscriptionId: subscription_id || null,
        customerEmail: customer_email || null,
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
    const { subscription_id = null, customer_email = null } = req.body || {};

    if (!subscription_id && !customer_email) {
      return sendError(res, 400, 'missing_identifier', 'customer_email or subscription_id is required.');
    }

    const identifierField = subscription_id ? 'subscription_id' : 'customer_email';
    const identifierValue = subscription_id || customer_email;

    let conn = null;

    try {
      conn = await pool.getConnection();
      await conn.beginTransaction();

      const keyRow = await findKeyRow(identifierField, identifierValue, conn);
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
        key: plaintextKey,
        key_prefix: prefix,
        key_last4: plaintextKey.slice(-4),
        subscription_id: keyRow.subscription_id || null,
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
