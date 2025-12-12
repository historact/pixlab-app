const { pool, query } = require('../db');
const { extractKeyPrefix, verifyApiKeyHash, generateApiKey, hashApiKey } = require('./apiKeys');

function normalizeActiveStatus(status) {
  if (!status) return 'disabled';
  const value = String(status).toLowerCase();
  if (['active', 'activated'].includes(value)) return 'active';
  if (['disabled', 'inactive', 'cancelled', 'blocked'].includes(value)) return 'disabled';
  return value;
}

function withinValidityWindow(record) {
  const now = Date.now();
  if (record.valid_from && new Date(record.valid_from).getTime() > now) return false;
  if (record.valid_until && new Date(record.valid_until).getTime() < now) return false;
  return true;
}

async function findCustomerKeyByPlaintext(plaintextKey) {
  const prefix = extractKeyPrefix(plaintextKey);
  if (!prefix) return null;

  const rows = await query(
    `SELECT ak.id, ak.key_prefix, ak.key_hash, ak.status, ak.plan_id, ak.customer_email, ak.customer_name,
            ak.valid_from, ak.valid_until, ak.subscription_id,
            p.plan_slug, p.name AS plan_name, p.monthly_quota_files AS monthly_quota
       FROM api_keys ak
       LEFT JOIN plans p ON ak.plan_id = p.id
      WHERE ak.key_prefix = ?
      ORDER BY ak.updated_at DESC
      LIMIT 1`,
    [prefix]
  );

  if (!rows.length) return null;
  const rec = rows[0];
  rec.status = normalizeActiveStatus(rec.status);

  if (rec.status !== 'active') return null;
  if (!withinValidityWindow(rec)) return null;

  const matches = await verifyApiKeyHash(rec.key_hash, plaintextKey);
  if (!matches) return null;

  return {
    id: rec.id,
    status: rec.status,
    plan_id: rec.plan_id,
    plan_slug: rec.plan_slug || null,
    plan_name: rec.plan_name || null,
    monthly_quota: rec.monthly_quota,
    customer_email: rec.customer_email || null,
    key_prefix: rec.key_prefix,
    subscription_id: rec.subscription_id || null,
  };
}

async function resolvePlanId(conn, { planId, planSlug }) {
  if (planId) return planId;
  if (!planSlug) return null;
  const [existing] = await conn.execute('SELECT id FROM plans WHERE plan_slug = ? LIMIT 1', [planSlug]);
  if (existing.length) return existing[0].id;

  const err = new Error(`Plan not found: ${planSlug}`);
  err.code = 'PLAN_NOT_FOUND';
  throw err;
}

async function findExistingKey(conn, { subscriptionId, customerEmail }) {
  if (subscriptionId) {
    const [rows] = await conn.execute(
      'SELECT id, key_prefix, plan_id, customer_email, subscription_id FROM api_keys WHERE subscription_id = ? ORDER BY updated_at DESC LIMIT 1',
      [subscriptionId]
    );
    if (rows.length) return rows[0];
  }

  if (customerEmail) {
    const [rows] = await conn.execute(
      'SELECT id, key_prefix, plan_id, customer_email, subscription_id FROM api_keys WHERE customer_email = ? ORDER BY updated_at DESC LIMIT 1',
      [customerEmail]
    );
    if (rows.length) return rows[0];
  }

  return null;
}

async function activateOrProvisionKey({ customerEmail, planId = null, planSlug = null, subscriptionId = null, orderId = null }) {
  const conn = await pool.getConnection();
  let plaintextKey = null;
  let keyPrefix = null;
  let resolvedPlanId = null;
  let created = false;

  try {
    await conn.beginTransaction();
    resolvedPlanId = await resolvePlanId(conn, { planId, planSlug });
    const existing = await findExistingKey(conn, { subscriptionId, customerEmail });

    if (!existing) {
      const { plaintextKey: key, prefix, keyHash } = await generateApiKey();
      plaintextKey = key;
      keyPrefix = prefix;
      await conn.execute(
        `INSERT INTO api_keys (key_prefix, key_hash, key_last4, status, plan_id, customer_email, subscription_id, order_id, created_at, updated_at)
         VALUES (?, ?, ?, 'active', ?, ?, ?, ?, NOW(), NOW())`,
        [
          prefix,
          keyHash,
          key.slice(-4),
          resolvedPlanId,
          customerEmail || null,
          subscriptionId || null,
          orderId || null,
        ]
      );
      created = true;
    } else {
      keyPrefix = existing.key_prefix;
      await conn.execute(
        `UPDATE api_keys
            SET status = 'active',
                plan_id = ?,
                customer_email = COALESCE(?, customer_email),
                subscription_id = COALESCE(?, subscription_id),
                order_id = COALESCE(?, order_id),
                updated_at = NOW()
          WHERE id = ?`,
        [
          resolvedPlanId || existing.plan_id || null,
          customerEmail || null,
          subscriptionId || null,
          orderId || null,
          existing.id,
        ]
      );
    }

    await conn.commit();
    return { plaintextKey, keyPrefix, planId: resolvedPlanId || planId || null, created };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function disableCustomerKey({ customerEmail = null, subscriptionId = null }) {
  const filters = [];
  const params = [];
  if (subscriptionId) {
    filters.push('subscription_id = ?');
    params.push(subscriptionId);
  }
  if (customerEmail) {
    filters.push('customer_email = ?');
    params.push(customerEmail);
  }
  if (!filters.length) {
    throw new Error('customerEmail or subscriptionId is required to disable a key');
  }
  const where = filters.join(' OR ');
  const [result] = await pool.execute(
    `UPDATE api_keys SET status = 'disabled', updated_at = NOW() WHERE ${where}`,
    params
  );
  return result.affectedRows || 0;
}

async function upgradeLegacyKey({ keyId, legacyKey }) {
  if (!keyId || !legacyKey) return null;
  const hash = await hashApiKey(legacyKey);
  const prefix = extractKeyPrefix(legacyKey);
  const [result] = await pool.execute(
    `UPDATE api_keys SET key_prefix = ?, key_hash = ?, status = 'active', updated_at = NOW() WHERE id = ?`,
    [prefix, hash, keyId]
  );
  return result.affectedRows === 1 ? { keyPrefix: prefix, keyHash: hash } : null;
}

module.exports = {
  activateOrProvisionKey,
  disableCustomerKey,
  findCustomerKeyByPlaintext,
  upgradeLegacyKey,
};
