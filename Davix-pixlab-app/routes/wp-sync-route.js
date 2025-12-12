const { sendError } = require('../utils/errorResponse');
const { query, pool } = require('../db');
const { getCurrentPeriod, getOrCreateUsageForKey } = require('../usage');

module.exports = function (app) {
  const syncToken = process.env.WP_SYNC_TOKEN;
  let ensuredLicenseKeyIndex = false;

  function requireToken(req, res, next) {
    const header = req.headers['x-davix-bridge-token'];
    if (!syncToken || header !== syncToken) {
      return sendError(res, 401, 'unauthorized', 'Access denied.');
    }
    return next();
  }

  async function ensureLicenseKeyUniqueIndex() {
    if (ensuredLicenseKeyIndex) return;

    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query(
        "SHOW INDEX FROM api_keys WHERE Key_name = 'uniq_license_key' OR (Non_unique = 0 AND Column_name = 'license_key')"
      );

      if (!rows.length) {
        console.warn(
          'api_keys.license_key is missing a UNIQUE index. Attempting to add uniq_license_key (license_key) to support upserts.'
        );
        await conn.query('ALTER TABLE api_keys ADD UNIQUE KEY uniq_license_key (license_key)');
      }

      ensuredLicenseKeyIndex = true;
    } catch (err) {
      console.warn(
        "Could not ensure api_keys.license_key UNIQUE index. Please run: ALTER TABLE api_keys ADD UNIQUE KEY uniq_license_key (license_key);",
        err.message
      );
    } finally {
      conn.release();
    }
  }

  function normalizeStatus(raw) {
    const num = Number(raw);
    if (Number.isFinite(num) && `${raw}`.trim() !== '') {
      if (num === 1) return 'sold';
      if (num === 2) return 'delivered';
      if (num === 3) return 'active';
      if (num === 4) return 'inactive';
    }

    if (typeof raw === 'string') {
      const value = raw.trim().toLowerCase();
      if (['sold', 'delivered', 'active', 'inactive', 'expired'].includes(value)) return value;
      if (value === 'activated') return 'active';
      if (value === 'deactive' || value === 'deactivated') return 'inactive';
    }

    return 'inactive';
  }

  app.post('/internal/wp-sync/test', requireToken, (req, res) => {
    res.json({ status: 'ok', baseUrl: process.env.BASE_URL || null });
  });

  app.post('/internal/wp-sync/plan', requireToken, async (req, res) => {
    try {
      const { name, monthly_quota, features } = req.body || {};

      if (!name) {
        return sendError(res, 400, 'missing_field', "The 'name' field (plan slug) is required.");
      }

      const planSlug = String(name).trim();
      const quota = Number.isFinite(Number(monthly_quota)) ? Number(monthly_quota) : 0;

      let displayName = planSlug;
      if (features && typeof features === 'object') {
        displayName =
          features.product_name ||
          features.plan_name ||
          features.productName ||
          displayName;
      }

      const descriptionJson = features ? JSON.stringify(features) : null;

      await query(
        `INSERT INTO plans (
            plan_slug,
            name,
            monthly_quota_files,
            description,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, NOW(), NOW())
          ON DUPLICATE KEY UPDATE
            name = VALUES(name),
            monthly_quota_files = VALUES(monthly_quota_files),
            description = VALUES(description),
            updated_at = NOW()
        `,
        [planSlug, displayName, quota, descriptionJson]
      );

      res.json({ status: 'ok' });
    } catch (err) {
      console.error('Plan sync failed:', err);

      sendError(res, 500, 'internal_error', 'Failed to sync plan.');
    }
  });

  app.post('/internal/wp-sync/license-upsert', requireToken, async (req, res) => {
    const {
      license_key,
      plan_name,
      plan_id,
      status,
      customer_email,
      customer_name,
      wp_order_id,
      wp_subscription_id,
      wp_user_id,
      valid_from,
      valid_until,
      metadata,
    } = req.body || {};

    console.log('[license-upsert] incoming body:', JSON.stringify(req.body));

    if (!license_key) {
      return sendError(res, 400, 'missing_field', "The 'license_key' field is required.");
    }

    const normalizedStatus = normalizeStatus(status);
    const metaJson = metadata
      ? typeof metadata === 'string'
        ? metadata
        : JSON.stringify(metadata)
      : null;
    let resolvedPlanId = plan_id || null;

    try {
      await ensureLicenseKeyUniqueIndex();

      if (!resolvedPlanId && plan_name) {
        const planRows = await query('SELECT id FROM plans WHERE plan_slug = ? OR name = ? LIMIT 1', [plan_name, plan_name]);
        if (planRows.length) {
          resolvedPlanId = planRows[0].id;
        }
      }

      await query(
        `INSERT INTO api_keys (
           license_key, plan_id, status, customer_email, customer_name,
           wp_order_id, wp_subscription_id, wp_user_id,
           valid_from, valid_until, metadata_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
         ON DUPLICATE KEY UPDATE
           plan_id = VALUES(plan_id),
           status = VALUES(status),
           customer_email = VALUES(customer_email),
           customer_name = VALUES(customer_name),
           wp_order_id = VALUES(wp_order_id),
           wp_subscription_id = VALUES(wp_subscription_id),
           wp_user_id = VALUES(wp_user_id),
           valid_from = VALUES(valid_from),
           valid_until = VALUES(valid_until),
           metadata_json = VALUES(metadata_json),
           updated_at = NOW()`,
        [
          license_key,
          resolvedPlanId,
          normalizedStatus,
          customer_email || null,
          customer_name || null,
          wp_order_id || null,
          wp_subscription_id || null,
          wp_user_id || null,
          valid_from || null,
          valid_until || null,
          metaJson,
        ]
      );

      return res.json({ status: 'ok' });
    } catch (err) {
      const details = { code: err.code, errno: err.errno, sqlMessage: err.sqlMessage };
      console.error('License upsert failed:', details);
      return sendError(res, 500, 'internal_error', 'Failed to sync license.', { details });
    }
  });

  app.post('/internal/wp-sync/license-delete', requireToken, async (req, res) => {
    try {
      const { license_key } = req.body || {};
      if (!license_key) {
        return sendError(res, 400, 'missing_field', "The 'license_key' field is required.");
      }
      await query('DELETE FROM api_keys WHERE license_key = ?', [license_key]);
      res.json({ status: 'ok' });
    } catch (err) {
      console.error('License delete failed:', err);
      sendError(res, 500, 'internal_error', 'Failed to delete license.');
    }
  });

  app.get('/internal/wp-sync/usage-summary', requireToken, async (req, res) => {
    try {
      const { license_key } = req.query;
      if (!license_key) {
        return sendError(res, 400, 'missing_field', "The 'license_key' query parameter is required.");
      }
      const rows = await query(
        `SELECT ak.id, ak.license_key, ak.status, ak.valid_from, ak.valid_until, ak.customer_email, ak.customer_name,
                p.name AS plan_name, p.monthly_quota_files AS monthly_quota
         FROM api_keys ak
         JOIN plans p ON ak.plan_id = p.id
         WHERE ak.license_key = ?
         LIMIT 1`,
        [license_key]
      );
      if (!rows.length) {
        return sendError(res, 404, 'not_found', 'License not found.');
      }
      const key = rows[0];
      const usage = await getOrCreateUsageForKey(key.id, key.monthly_quota);
      const remaining = Number.isFinite(key.monthly_quota)
        ? Math.max(0, key.monthly_quota - usage.used_files)
        : null;
      res.json({
        license_key: key.license_key,
        plan: key.plan_name,
        status: key.status,
        valid_from: key.valid_from,
        valid_until: key.valid_until,
        monthly_quota: key.monthly_quota,
        period: usage.period,
        used_files: usage.used_files,
        remaining,
      });
    } catch (err) {
      console.error('Usage summary failed:', err);
      sendError(res, 500, 'internal_error', 'Failed to fetch usage summary.');
    }
  });

  app.get('/internal/wp-sync/usage-log', requireToken, async (req, res) => {
    try {
      const { license_key, limit } = req.query;
      if (!license_key) {
        return sendError(res, 400, 'missing_field', "The 'license_key' query parameter is required.");
      }
      const rows = await query('SELECT id FROM api_keys WHERE license_key = ? LIMIT 1', [license_key]);
      if (!rows.length) {
        return sendError(res, 404, 'not_found', 'License not found.');
      }
      const max = Math.min(parseInt(limit, 10) || 50, 200);
      const logs = await query(
        `SELECT timestamp, endpoint, action, status, error_code, files_processed, bytes_in, bytes_out, params_json
         FROM request_log
         WHERE api_key_id = ?
         ORDER BY timestamp DESC
         LIMIT ${max}`,
        [rows[0].id]
      );
      res.json({ logs });
    } catch (err) {
      console.error('Usage log failed:', err);
      sendError(res, 500, 'internal_error', 'Failed to fetch usage log.');
    }
  });

  app.post('/internal/wp-sync/full-sync', requireToken, async (req, res) => {
    try {
      res.json({
        status: 'ok',
        message:
          'Full sync endpoint reached. WordPress should push plans and licenses via the other sync routes.',
      });
    } catch (err) {
      console.error('Full sync handler failed:', err);
      sendError(res, 500, 'internal_error', 'Failed to handle full sync request.');
    }
  });
};
