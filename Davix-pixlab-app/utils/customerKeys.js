const { pool, query } = require('../db');
const { extractKeyPrefix, verifyApiKeyHash, generateApiKey, hashApiKey } = require('./apiKeys');

function normalizeActiveStatus(status) {
  if (!status) return 'disabled';
  const value = String(status).toLowerCase();
  if (['active', 'activated'].includes(value)) return 'active';
  if (['disabled', 'inactive', 'cancelled', 'blocked'].includes(value)) return 'disabled';
  return value;
}

function parseUtcDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;

  const str = String(value).trim();
  if (!str) return null;

  const normalized = str.includes(' ') && !str.endsWith('Z') ? `${str.replace(' ', 'T')}Z` : str;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function withinValidityWindow(record) {
  const now = Date.now();
  const validFrom = parseUtcDate(record.valid_from);
  const validUntil = parseUtcDate(record.valid_until);

  if (validFrom && validFrom.getTime() > now) return { ok: false, reason: 'not_active_yet' };
  if (validUntil && validUntil.getTime() < now) return { ok: false, reason: 'expired' };
  return { ok: true };
}

async function findCustomerKeyByPlaintext(plaintextKey) {
  const prefix = extractKeyPrefix(plaintextKey);
  if (!prefix) return { key: null, error: 'invalid', hint: 'Key format is not recognized.' };

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

  if (!rows.length) return { key: null, error: 'not_found' };
  const rec = rows[0];
  rec.status = normalizeActiveStatus(rec.status);

  if (rec.status !== 'active') {
    return { key: null, error: 'inactive', hint: 'Key is disabled. Contact support to re-enable.' };
  }

  const validity = withinValidityWindow(rec);
  if (!validity.ok) {
    return {
      key: null,
      error: validity.reason === 'expired' ? 'expired' : 'not_active_yet',
      hint: validity.reason === 'expired' ? 'Key expired.' : 'Key not active yet.',
    };
  }

  const matches = await verifyApiKeyHash(rec.key_hash, plaintextKey);
  if (!matches) return { key: null, error: 'hash_mismatch' };

  return {
    key: {
      id: rec.id,
      status: rec.status,
      plan_id: rec.plan_id,
      plan_slug: rec.plan_slug || null,
      plan_name: rec.plan_name || null,
      monthly_quota: rec.monthly_quota,
      customer_email: rec.customer_email || null,
      key_prefix: rec.key_prefix,
      subscription_id: rec.subscription_id || null,
      valid_from: rec.valid_from || null,
      valid_until: rec.valid_until || null,
    },
    error: null,
    hint: null,
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
      'SELECT id, key_prefix, key_hash, key_last4, plan_id, customer_email, subscription_id, valid_from, valid_until FROM api_keys WHERE subscription_id = ? ORDER BY updated_at DESC LIMIT 1',
      [subscriptionId]
    );
    if (rows.length) return rows[0];
    return null;
  }

  if (customerEmail) {
    const [rows] = await conn.execute(
      'SELECT id, key_prefix, key_hash, key_last4, plan_id, customer_email, subscription_id, valid_from, valid_until FROM api_keys WHERE customer_email = ? ORDER BY updated_at DESC LIMIT 1',
      [customerEmail]
    );
    if (rows.length) return rows[0];
  }

  return null;
}

async function activateOrProvisionKey({
  customerEmail,
  planId = null,
  planSlug = null,
  subscriptionId = null,
  orderId = null,
  validFrom = null,
  validUntil = null,
  providedValidFrom = false,
  providedValidUntil = false,
}) {
  const conn = await pool.getConnection();
  let plaintextKey = null;
  let keyPrefix = null;
  let keyLast4 = null;
  let resolvedPlanId = null;
  let created = false;

  try {
    await conn.beginTransaction();
    await conn.execute('UPDATE api_keys SET license_key = NULL WHERE license_key = ""');
    resolvedPlanId = await resolvePlanId(conn, { planId, planSlug });
    const existing = await findExistingKey(conn, { subscriptionId, customerEmail });

    if (!existing) {
      const { plaintextKey: key, prefix, keyHash } = await generateApiKey();
      plaintextKey = key;
      keyPrefix = prefix;
      await conn.execute(
        `INSERT INTO api_keys (key_prefix, key_hash, key_last4, license_key, status, plan_id, customer_email, subscription_id, order_id, valid_from, valid_until, created_at, updated_at)
         VALUES (?, ?, ?, NULL, 'active', ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          prefix,
          keyHash,
          key.slice(-4),
          resolvedPlanId,
          customerEmail || null,
          subscriptionId || null,
          orderId || null,
          validFrom || null,
          validUntil || null,
        ]
      );
      keyLast4 = key.slice(-4);
      created = true;
    } else {
      keyPrefix = existing.key_prefix;
      keyLast4 = existing.key_last4 || null;
      let updateKeyFields = {};
      if (!existing.key_hash) {
        const { plaintextKey: key, prefix, keyHash } = await generateApiKey();
        plaintextKey = key;
        keyPrefix = prefix;
        updateKeyFields = { prefix, keyHash, last4: key.slice(-4) };
        keyLast4 = key.slice(-4);
      }

      const params = [resolvedPlanId || existing.plan_id || null, customerEmail || null, subscriptionId || null, orderId || null];

      const setParts = [
        "status = 'active'",
        'plan_id = ?',
        'customer_email = COALESCE(?, customer_email)',
        'subscription_id = COALESCE(?, subscription_id)',
        'order_id = COALESCE(?, order_id)',
        'license_key = NULL',
        'updated_at = NOW()',
      ];

      if (providedValidFrom) {
        setParts.push('valid_from = ?');
        params.push(validFrom || null);
      }

      if (providedValidUntil) {
        setParts.push('valid_until = ?');
        params.push(validUntil || null);
      }

      if (updateKeyFields.prefix && updateKeyFields.keyHash) {
        setParts.push('key_prefix = ?', 'key_hash = ?', 'key_last4 = ?');
        params.push(updateKeyFields.prefix, updateKeyFields.keyHash, updateKeyFields.last4);
      }

      params.push(existing.id);

      await conn.execute(
        `UPDATE api_keys
            SET ${setParts.join(', ')}
          WHERE id = ?`,
        params
      );
    }

    const currentValidFrom = providedValidFrom ? validFrom : existing?.valid_from ?? null;
    const currentValidUntil = providedValidUntil ? validUntil : existing?.valid_until ?? null;

    await conn.commit();
    return {
      plaintextKey,
      keyPrefix,
      keyLast4,
      planId: resolvedPlanId || planId || null,
      created,
      validFrom: currentValidFrom,
      validUntil: currentValidUntil,
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function disableCustomerKey({ customerEmail = null, subscriptionId = null }) {
  if (!subscriptionId && !customerEmail) {
    throw new Error('customerEmail or subscriptionId is required to disable a key');
  }

  if (subscriptionId) {
    const [result] = await pool.execute(
      `UPDATE api_keys SET status = 'disabled', license_key = NULL, updated_at = NOW() WHERE subscription_id = ?`,
      [subscriptionId]
    );
    return result.affectedRows || 0;
  }

  const [result] = await pool.execute(
    `UPDATE api_keys SET status = 'disabled', license_key = NULL, updated_at = NOW() WHERE customer_email = ?`,
    [customerEmail]
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
