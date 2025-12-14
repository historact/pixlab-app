const { pool, query } = require('../db');
const { extractKeyPrefix, verifyApiKeyHash, generateApiKey, hashApiKey } = require('./apiKeys');
const {
  getValidFromGraceSeconds,
  immediateValidFromUTC,
  normalizeManualValidFrom,
  parseMysqlUtcDatetime,
  toMysqlUtcDatetime,
  utcNow,
} = require('./time');

function normalizeActiveStatus(status) {
  if (!status) return 'disabled';
  const value = String(status).toLowerCase();
  if (['active', 'activated'].includes(value)) return 'active';
  if (['disabled', 'inactive', 'cancelled', 'blocked'].includes(value)) return 'disabled';
  return value;
}

function withinValidityWindow(record) {
  const now = utcNow().getTime();
  const validFrom = parseMysqlUtcDatetime(record.valid_from ?? null);
  const validUntil = parseMysqlUtcDatetime(record.valid_until ?? null);

  if (validFrom && validFrom.getTime() > now) return { ok: false, reason: 'not_active_yet' };
  if (validUntil && now > validUntil.getTime()) return { ok: false, reason: 'expired' };
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

async function findExistingKey(
  conn,
  { wpUserId = null, customerEmail = null, subscriptionId = null, externalSubscriptionId = null }
) {
  const baseFields =
    'id, key_prefix, key_hash, key_last4, plan_id, customer_email, customer_name, subscription_id, external_subscription_id, order_id, wp_user_id, valid_from, valid_until, subscription_status';

  const normalizedEmail = customerEmail ? String(customerEmail).trim().toLowerCase() : null;

  if (wpUserId) {
    const [rows] = await conn.execute(
      `SELECT ${baseFields} FROM api_keys WHERE wp_user_id = ? ORDER BY updated_at DESC LIMIT 1`,
      [wpUserId]
    );
    if (rows.length) return rows[0];
  }

  if (normalizedEmail) {
    const [rows] = await conn.execute(
      `SELECT ${baseFields} FROM api_keys WHERE LOWER(customer_email) = ? ORDER BY updated_at DESC LIMIT 1`,
      [normalizedEmail]
    );
    if (rows.length) return rows[0];
  }

  if (subscriptionId) {
    const [rows] = await conn.execute(
      `SELECT ${baseFields} FROM api_keys WHERE subscription_id = ? OR external_subscription_id = ? ORDER BY updated_at DESC LIMIT 1`,
      [subscriptionId, subscriptionId]
    );
    if (rows.length) return rows[0];
  }

  if (externalSubscriptionId) {
    const [rows] = await conn.execute(
      `SELECT ${baseFields} FROM api_keys WHERE external_subscription_id = ? OR subscription_id = ? ORDER BY updated_at DESC LIMIT 1`,
      [externalSubscriptionId, externalSubscriptionId]
    );
    if (rows.length) return rows[0];
  }

  return null;
}

async function activateOrProvisionKey({
  wpUserId = null,
  customerEmail,
  customerName = null,
  planId = null,
  planSlug = null,
  subscriptionId = null,
  externalSubscriptionId = null,
  orderId = null,
  subscriptionStatus = null,
  manualValidFrom = null,
  validUntil = null,
  providedValidFrom = false,
  providedValidUntil = false,
  forceImmediateValidFrom = false,
}) {
  const conn = await pool.getConnection();
  let plaintextKey = null;
  let keyPrefix = null;
  let keyLast4 = null;
  let resolvedPlanId = null;
  let created = false;
  const graceSeconds = getValidFromGraceSeconds();
  const normalizedEmail = customerEmail ? String(customerEmail).trim().toLowerCase() : null;
  const now = utcNow();

  try {
    await conn.beginTransaction();
    await conn.execute('UPDATE api_keys SET license_key = NULL WHERE license_key = ""');
    resolvedPlanId = await resolvePlanId(conn, { planId, planSlug });
    const existing = await findExistingKey(conn, { wpUserId, customerEmail: normalizedEmail, subscriptionId, externalSubscriptionId });

    const parsedExistingValidFrom = parseMysqlUtcDatetime(existing?.valid_from ?? null);
    const parsedExistingValidUntil = parseMysqlUtcDatetime(existing?.valid_until ?? null);

    let shouldUpdateValidFrom = false;
    let shouldUpdateValidUntil = false;

    let normalizedValidFrom = null;
    let normalizedValidUntil = null;

    if (forceImmediateValidFrom) {
      normalizedValidFrom = immediateValidFromUTC(graceSeconds);
      shouldUpdateValidFrom = true;
    } else if (providedValidFrom) {
      normalizedValidFrom = normalizeManualValidFrom(manualValidFrom, now, graceSeconds);
      shouldUpdateValidFrom = true;
    } else if (existing) {
      normalizedValidFrom = parsedExistingValidFrom || immediateValidFromUTC(graceSeconds);
      shouldUpdateValidFrom = !parsedExistingValidFrom;
    } else {
      normalizedValidFrom = immediateValidFromUTC(graceSeconds);
      shouldUpdateValidFrom = true;
    }

    if (providedValidUntil) {
      normalizedValidUntil = validUntil || null;
      shouldUpdateValidUntil = true;
    } else if (existing) {
      normalizedValidUntil = parsedExistingValidUntil;
    } else {
      normalizedValidUntil = null;
      shouldUpdateValidUntil = true;
    }

    const effectiveValidFrom = shouldUpdateValidFrom ? normalizedValidFrom : parsedExistingValidFrom;
    if (effectiveValidFrom && normalizedValidUntil && normalizedValidUntil.getTime() <= effectiveValidFrom.getTime()) {
      const err = new Error('valid_until must be after valid_from');
      err.code = 'INVALID_PARAMETER';
      err.message = 'valid_until must be after valid_from.';
      throw err;
    }

    const nextCustomerEmail = normalizedEmail ?? (existing?.customer_email || null);
    const nextCustomerName = customerName ?? existing?.customer_name ?? null;
    const nextWpUserId = wpUserId ?? existing?.wp_user_id ?? null;
    const nextSubscriptionStatus = subscriptionStatus ?? existing?.subscription_status ?? null;
    const nextSubscriptionId = subscriptionId ?? existing?.subscription_id ?? null;
    const nextExternalSubscriptionId = externalSubscriptionId ?? existing?.external_subscription_id ?? null;
    const nextOrderId = orderId ?? existing?.order_id ?? null;

    if (!existing) {
      const { plaintextKey: key, prefix, keyHash } = await generateApiKey();
      plaintextKey = key;
      keyPrefix = prefix;
      await conn.execute(
        `INSERT INTO api_keys (key_prefix, key_hash, key_last4, license_key, status, plan_id, customer_email, customer_name, wp_user_id, subscription_status, subscription_id, external_subscription_id, order_id, valid_from, valid_until, created_at, updated_at)
         VALUES (?, ?, ?, NULL, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          prefix,
          keyHash,
          key.slice(-4),
          resolvedPlanId,
          nextCustomerEmail,
          nextCustomerName,
          nextWpUserId,
          nextSubscriptionStatus,
          nextSubscriptionId,
          nextExternalSubscriptionId ?? nextSubscriptionId,
          nextOrderId,
          normalizedValidFrom ? toMysqlUtcDatetime(normalizedValidFrom) : null,
          normalizedValidUntil ? toMysqlUtcDatetime(normalizedValidUntil) : null,
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

      const params = [
        resolvedPlanId || existing.plan_id || null,
        nextCustomerEmail,
        nextCustomerName,
        nextWpUserId,
        nextSubscriptionStatus,
        nextSubscriptionId,
        nextExternalSubscriptionId ?? nextSubscriptionId,
        nextOrderId,
      ];

      const setParts = [
        "status = 'active'",
        'plan_id = ?',
        'customer_email = ?',
        'customer_name = ?',
        'wp_user_id = ?',
        'subscription_status = ?',
        'subscription_id = ?',
        'external_subscription_id = ?',
        'order_id = ?',
        'license_key = NULL',
        'updated_at = NOW()',
      ];

      if (shouldUpdateValidFrom) {
        setParts.push('valid_from = ?');
        params.push(normalizedValidFrom ? toMysqlUtcDatetime(normalizedValidFrom) : null);
      }

      if (shouldUpdateValidUntil) {
        setParts.push('valid_until = ?');
        params.push(normalizedValidUntil ? toMysqlUtcDatetime(normalizedValidUntil) : null);
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

    const currentValidFrom = normalizedValidFrom ? toMysqlUtcDatetime(normalizedValidFrom) : null;
    const currentValidUntil = normalizedValidUntil ? toMysqlUtcDatetime(normalizedValidUntil) : null;

    await conn.commit();
    return {
      plaintextKey,
      keyPrefix,
      keyLast4,
      planId: resolvedPlanId || planId || null,
      created,
      wpUserId: nextWpUserId,
      customerName: nextCustomerName,
      subscriptionStatus: nextSubscriptionStatus,
      subscriptionId: nextSubscriptionId,
      externalSubscriptionId: nextExternalSubscriptionId ?? nextSubscriptionId,
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

async function disableCustomerKey({ customerEmail = null, wpUserId = null, subscriptionId = null }) {
  if (!subscriptionId && !customerEmail && !wpUserId) {
    throw new Error('customerEmail, wpUserId, or subscriptionId is required to disable a key');
  }

  const normalizedEmail = customerEmail ? String(customerEmail).trim().toLowerCase() : null;

  if (wpUserId) {
    const [result] = await pool.execute(
      `UPDATE api_keys SET status = 'disabled', license_key = NULL, updated_at = NOW() WHERE wp_user_id = ?`,
      [wpUserId]
    );
    if (result.affectedRows) return result.affectedRows;
  }

  if (normalizedEmail) {
    const [result] = await pool.execute(
      `UPDATE api_keys SET status = 'disabled', license_key = NULL, updated_at = NOW() WHERE LOWER(customer_email) = ?`,
      [normalizedEmail]
    );
    if (result.affectedRows) return result.affectedRows;
  }

  if (subscriptionId) {
    const [result] = await pool.execute(
      `UPDATE api_keys SET status = 'disabled', license_key = NULL, updated_at = NOW() WHERE subscription_id = ? OR external_subscription_id = ?`,
      [subscriptionId, subscriptionId]
    );
    return result.affectedRows || 0;
  }

  return 0;
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
