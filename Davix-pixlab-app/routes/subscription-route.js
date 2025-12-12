const { sendError } = require('../utils/errorResponse');
const { activateOrProvisionKey, disableCustomerKey } = require('../utils/customerKeys');
const { pool } = require('../db');

module.exports = function (app) {
  const bridgeToken = process.env.SUBSCRIPTION_BRIDGE_TOKEN || process.env.X_DAVIX_BRIDGE_TOKEN;

  function requireToken(req, res, next) {
    const header = req.headers['x-davix-bridge-token'];
    if (!bridgeToken || header !== bridgeToken) {
      return sendError(res, 401, 'unauthorized', 'Access denied.');
    }
    return next();
  }

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
