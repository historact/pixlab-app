const { sendError } = require('../utils/errorResponse');
const { query } = require('../db');
const { getCurrentPeriod, getOrCreateUsageForKey } = require('../usage');

module.exports = function (app) {
  const syncToken = process.env.WP_SYNC_TOKEN;

  function requireToken(req, res, next) {
    const header = req.headers['x-davix-bridge-token'];
    if (!syncToken || header !== syncToken) {
      return sendError(res, 401, 'unauthorized', 'Access denied.');
    }
    return next();
  }

  function normalizeLicenseStatus(raw) {
    // Map numeric LMFWC codes to text:
    // 1 = sold, 2 = delivered, 3 = active, 4 = inactive
    const map = {
      1: 'sold',
      2: 'delivered',
      3: 'active',
      4: 'inactive',
    };

    if (raw === undefined || raw === null || raw === '') {
      return 'active';
    }

    // If a number was passed
    if (typeof raw === 'number') {
      return map[raw] || 'unknown';
    }

    // If a numeric-looking string
    const num = Number(raw);
    if (!Number.isNaN(num) && map[num]) {
      return map[num];
    }

    // Otherwise, assume it is already a textual status
    return String(raw).toLowerCase();
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
    try {
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

      if (!license_key) {
        return sendError(res, 400, 'missing_field', "The 'license_key' field is required.");
      }

      const meta = metadata || {};

      // 1) Normalize status
      const normalizedStatus = normalizeLicenseStatus(status);

      // 2) Resolve plan id
      let resolvedPlanId = plan_id || null;

      let planLookup = null;
      if (meta.plan_slug) {
        planLookup = meta.plan_slug;
      } else if (plan_name) {
        planLookup = plan_name;
      } else if (meta.plan_title) {
        planLookup = meta.plan_title;
      }

      if (!resolvedPlanId) {
        if (!planLookup) {
          return sendError(res, 400, 'invalid_plan', 'Missing plan identifier (plan_id or plan_name).');
        }

        const rows = await query(
          'SELECT id FROM plans WHERE plan_slug = ? OR name = ? LIMIT 1',
          [planLookup, planLookup]
        );

        if (!rows.length) {
          return sendError(res, 400, 'invalid_plan', 'The specified plan does not exist.');
        }

        resolvedPlanId = rows[0].id;
      }

      const wpLicenseId = meta.wp_license_id || null;
      const productId = meta.product_id || null;
      const subscriptionStat = meta.subscription_status || null;
      const notes = meta ? JSON.stringify(meta) : null;

      await query(
        `INSERT INTO api_keys (
           license_key,
           plan_id,
           wp_license_id,
           wp_user_id,
           wp_product_id,
           subscription_id,
           order_id,
           status,
           subscription_status,
           valid_from,
           valid_until,
           customer_email,
           customer_name,
           notes,
           created_at,
           updated_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
         ON DUPLICATE KEY UPDATE
           plan_id             = VALUES(plan_id),
           wp_license_id       = VALUES(wp_license_id),
           wp_user_id          = VALUES(wp_user_id),
           wp_product_id       = VALUES(wp_product_id),
           subscription_id     = VALUES(subscription_id),
           order_id            = VALUES(order_id),
           status              = VALUES(status),
           subscription_status = VALUES(subscription_status),
           valid_from          = VALUES(valid_from),
           valid_until         = VALUES(valid_until),
           customer_email      = VALUES(customer_email),
           customer_name       = VALUES(customer_name),
           notes               = VALUES(notes),
           updated_at          = NOW()`,
        [
          license_key,
          resolvedPlanId,
          wpLicenseId,
          wp_user_id || null,
          productId,
          wp_subscription_id || null,
          wp_order_id || null,
          normalizedStatus,
          subscriptionStat,
          valid_from || null,
          valid_until || null,
          customer_email || null,
          customer_name || null,
          notes,
        ]
      );

      return res.json({ status: 'ok' });
    } catch (err) {
      console.error('License upsert failed:', err);
      return sendError(res, 500, 'internal_error', 'Failed to sync license.');
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
