const { sendError } = require('../utils/errorResponse');
const { activateOrProvisionKey, disableCustomerKey } = require('../utils/customerKeys');

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
    const { event, customer_email, plan_slug, plan_id, external_subscription_id, status, metadata } = req.body || {};

    if (!customer_email && !external_subscription_id) {
      return sendError(res, 400, 'missing_field', 'customer_email or external_subscription_id is required.');
    }

    const normalizedEvent = String(event || status || '').trim().toLowerCase();
    const activationEvents = ['activated', 'renewed', 'active', 'reactivated'];
    const disableEvents = ['cancelled', 'expired', 'payment_failed', 'paused', 'disabled'];

    try {
      if (activationEvents.includes(normalizedEvent)) {
        const result = await activateOrProvisionKey({
          customerEmail: customer_email || null,
          planId: plan_id || null,
          planSlug: plan_slug || null,
          externalSubscriptionId: external_subscription_id || null,
          metadata: metadata || null,
        });

        return res.json({
          status: 'ok',
          action: result.created ? 'created' : 'updated',
          key: result.plaintextKey || null,
          key_prefix: result.keyPrefix,
          plan_id: result.planId,
        });
      }

      if (disableEvents.includes(normalizedEvent)) {
        const affected = await disableCustomerKey({
          customerEmail: customer_email || null,
          externalSubscriptionId: external_subscription_id || null,
        });

        return res.json({ status: 'ok', action: 'disabled', affected });
      }

      return sendError(res, 400, 'unsupported_event', 'The provided event is not supported.', {
        supported: [...activationEvents, ...disableEvents],
      });
    } catch (err) {
      console.error('Subscription event failed:', err);
      return sendError(res, 500, 'internal_error', 'Failed to process subscription event.');
    }
  });
};
