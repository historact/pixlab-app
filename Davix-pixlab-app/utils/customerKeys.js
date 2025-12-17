const { pool, query } = require('../db');
const { logError } = require('./logger');
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

const columnExistsCache = {};

async function hasColumn(conn, table, column) {
  const cacheKey = `${table}.${column}`;
  if (Object.prototype.hasOwnProperty.call(columnExistsCache, cacheKey)) {
    return columnExistsCache[cacheKey];
  }

  try {
    const [rows] = await conn.execute(
      `SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1`,
      [table, column]
    );
    columnExistsCache[cacheKey] = rows.length > 0;
  } catch (err) {
    columnExistsCache[cacheKey] = false;
  }

  return columnExistsCache[cacheKey];
}

async function loadFreePlan() {
  const [rows] = await query('SELECT * FROM plans WHERE plan_slug = ? LIMIT 1', ['free']);
  return rows[0] || null;
}

async function findCustomerKeyByPlaintext(plaintextKey) {
  const prefix = extractKeyPrefix(plaintextKey);
  if (!prefix) return { key: null, error: 'invalid', hint: 'Key format is not recognized.' };

  let rows;
  try {
    rows = await query(
      `SELECT ak.id, ak.key_prefix, ak.key_hash, ak.status, ak.plan_id, ak.customer_email, ak.customer_name,
              ak.valid_from, ak.valid_until, ak.subscription_id,
              p.id AS joined_plan_id, p.plan_slug, p.name AS plan_name, p.monthly_quota_files AS monthly_quota,
              p.billing_period, p.is_free
         FROM api_keys ak
         LEFT JOIN plans p ON ak.plan_id = p.id
        WHERE ak.key_prefix = ?
        ORDER BY ak.updated_at DESC
        LIMIT 1`,
      [prefix]
    );
  } catch (err) {
    logError('customer_keys.lookup.failed', {
      message: err.message,
      code: err.code,
      stack: err.stack,
    });
    throw err;
  }

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

  let planDetails = null;
  if (rec.joined_plan_id) {
    planDetails = {
      id: rec.joined_plan_id,
      plan_slug: rec.plan_slug || null,
      name: rec.plan_name || null,
      monthly_quota_files: rec.monthly_quota,
      billing_period: rec.billing_period || null,
      is_free: rec.is_free === 1 || rec.is_free === true,
    };
  }

  if (!planDetails && rec.plan_slug) {
    try {
      const [rows] = await query('SELECT * FROM plans WHERE plan_slug = ? LIMIT 1', [rec.plan_slug]);
      if (rows[0]) {
        planDetails = {
          id: rows[0].id,
          plan_slug: rows[0].plan_slug || rec.plan_slug,
          name: rows[0].name || null,
          monthly_quota_files: rows[0].monthly_quota_files || null,
          billing_period: rows[0].billing_period || null,
          is_free: rows[0].is_free === 1 || rows[0].is_free === true,
        };
      }
    } catch (err) {
      logError('plan.lookup_by_slug.failed', {
        plan_slug: rec.plan_slug,
        message: err.message,
        code: err.code,
        stack: err.stack,
      });
    }
  }

  if (!planDetails) {
    try {
      const freePlan = await loadFreePlan();
      if (freePlan) {
        planDetails = {
          id: freePlan.id,
          plan_slug: freePlan.plan_slug || 'free',
          name: freePlan.name || 'Free',
          monthly_quota_files: freePlan.monthly_quota_files || null,
          billing_period: freePlan.billing_period || null,
          is_free: freePlan.is_free === 1 || freePlan.is_free === true,
        };

        if (!rec.plan_id || rec.plan_id !== freePlan.id) {
          try {
            await pool.execute('UPDATE api_keys SET plan_id = ? WHERE id = ? LIMIT 1', [freePlan.id, rec.id]);
          } catch (err) {
            console.warn('[DAVIX][plan] failed to self-heal plan_id to free', err.message);
          }
        }
      }
    } catch (err) {
      logError('plan.fallback_free.failed', {
        message: err.message,
        code: err.code,
        stack: err.stack,
      });
    }
  }

  const monthlyQuota = planDetails?.monthly_quota_files ?? rec.monthly_quota;

  return {
    key: {
      id: rec.id,
      status: rec.status,
      plan_id: rec.plan_id || planDetails?.id || null,
      plan_slug: planDetails?.plan_slug || rec.plan_slug || null,
      plan_name: planDetails?.name || rec.plan_name || null,
      monthly_quota: monthlyQuota,
      customer_email: rec.customer_email || null,
      key_prefix: rec.key_prefix,
      subscription_id: rec.subscription_id || null,
      valid_from: rec.valid_from || null,
      valid_until: rec.valid_until || null,
      plan: planDetails,
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

function deriveIdentityUsed({ wpUserId = null, customerEmail = null, subscriptionId = null, orderId = null }) {
  if (wpUserId !== null && wpUserId !== undefined) return { type: 'wp_user_id', value: wpUserId };
  if (customerEmail) return { type: 'customer_email', value: customerEmail };
  if (subscriptionId) return { type: 'subscription_id', value: subscriptionId };
  if (orderId) return { type: 'order_id', value: orderId };
  return null;
}

async function findExistingKey(
  conn,
  { wpUserId = null, customerEmail = null, subscriptionId = null, externalSubscriptionId = null, orderId = null }
) {
  const hasExternalSubscriptionId = await hasColumn(conn, 'api_keys', 'external_subscription_id');
  const baseFieldList = [
    'id',
    'key_prefix',
    'key_hash',
    'key_last4',
    'plan_id',
    'customer_email',
    'customer_name',
    'subscription_id',
  ];

  if (hasExternalSubscriptionId) {
    baseFieldList.push('external_subscription_id');
  }

  baseFieldList.push('order_id', 'wp_user_id', 'valid_from', 'valid_until', 'subscription_status');

  const baseFields = baseFieldList.join(', ');

  const normalizedEmail = customerEmail ? String(customerEmail).trim().toLowerCase() : null;

  if (wpUserId) {
    const [rows] = await conn.execute(
      `SELECT ${baseFields} FROM api_keys WHERE wp_user_id = ? ORDER BY updated_at DESC LIMIT 1`,
      [wpUserId]
    );
    if (rows.length) return { record: rows[0], identityUsed: { type: 'wp_user_id', value: wpUserId } };
  }

  if (normalizedEmail) {
    const [rows] = await conn.execute(
      `SELECT ${baseFields} FROM api_keys WHERE LOWER(customer_email) = ? ORDER BY updated_at DESC LIMIT 1`,
      [normalizedEmail]
    );
    if (rows.length) return { record: rows[0], identityUsed: { type: 'customer_email', value: normalizedEmail } };
  }

  if (subscriptionId) {
    const whereParts = ['subscription_id = ?'];
    const params = [subscriptionId];
    if (hasExternalSubscriptionId) {
      whereParts.push('external_subscription_id = ?');
      params.push(subscriptionId);
    }

    const [rows] = await conn.execute(
      `SELECT ${baseFields} FROM api_keys WHERE ${whereParts.join(' OR ')} ORDER BY updated_at DESC LIMIT 1`,
      params
    );
    if (rows.length) return { record: rows[0], identityUsed: { type: 'subscription_id', value: subscriptionId } };
  }

  if (hasExternalSubscriptionId && externalSubscriptionId) {
    const [rows] = await conn.execute(
      `SELECT ${baseFields} FROM api_keys WHERE external_subscription_id = ? OR subscription_id = ? ORDER BY updated_at DESC LIMIT 1`,
      [externalSubscriptionId, externalSubscriptionId]
    );
    if (rows.length)
      return { record: rows[0], identityUsed: { type: 'external_subscription_id', value: externalSubscriptionId } };
  }

  if (orderId) {
    const [rows] = await conn.execute(
      `SELECT ${baseFields} FROM api_keys WHERE order_id = ? ORDER BY updated_at DESC LIMIT 1`,
      [orderId]
    );
    if (rows.length) return { record: rows[0], identityUsed: { type: 'order_id', value: orderId } };
  }

  return { record: null, identityUsed: null };
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
    const externalSubscriptionIdExists = await hasColumn(conn, 'api_keys', 'external_subscription_id');
    resolvedPlanId = await resolvePlanId(conn, { planId, planSlug });
    const { record: existing, identityUsed } = await findExistingKey(conn, {
      wpUserId,
      customerEmail: normalizedEmail,
      subscriptionId,
      externalSubscriptionId,
      orderId,
    });

    const parsedExistingValidFrom = parseMysqlUtcDatetime(existing?.valid_from ?? null);
    const parsedExistingValidUntil = parseMysqlUtcDatetime(existing?.valid_until ?? null);

    let shouldUpdateValidFrom = false;
    let shouldUpdateValidUntil = false;

    let normalizedValidFrom = null;
    let normalizedValidUntil = null;

    if (existing) {
      if (providedValidFrom) {
        normalizedValidFrom = normalizeManualValidFrom(manualValidFrom, now, graceSeconds);
        shouldUpdateValidFrom = true;
      } else {
        normalizedValidFrom = parsedExistingValidFrom;
      }
    } else {
      if (forceImmediateValidFrom) {
        normalizedValidFrom = immediateValidFromUTC(graceSeconds);
      } else if (providedValidFrom) {
        normalizedValidFrom = normalizeManualValidFrom(manualValidFrom, now, graceSeconds);
      } else {
        normalizedValidFrom = immediateValidFromUTC(graceSeconds);
      }
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
    const nextExternalSubscriptionId = externalSubscriptionIdExists
      ? externalSubscriptionId ?? existing?.external_subscription_id ?? null
      : null;
    const nextOrderId = orderId ?? existing?.order_id ?? null;

    let apiKeyId = existing?.id || null;

    if (!existing) {
      const { plaintextKey: key, prefix, keyHash } = await generateApiKey();
      plaintextKey = key;
      keyPrefix = prefix;
      const insertColumns = [
        'key_prefix',
        'key_hash',
        'key_last4',
        'license_key',
        'status',
        'plan_id',
        'customer_email',
        'customer_name',
        'wp_user_id',
        'subscription_status',
        'subscription_id',
      ];

      const insertValues = [
        prefix,
        keyHash,
        key.slice(-4),
        null,
        'active',
        resolvedPlanId,
        nextCustomerEmail,
        nextCustomerName,
        nextWpUserId,
        nextSubscriptionStatus,
        nextSubscriptionId,
      ];

      if (externalSubscriptionIdExists) {
        insertColumns.push('external_subscription_id');
        insertValues.push(nextExternalSubscriptionId ?? nextSubscriptionId);
      }

      insertColumns.push('order_id', 'valid_from', 'valid_until', 'created_at', 'updated_at');
      insertValues.push(
        nextOrderId,
        normalizedValidFrom ? toMysqlUtcDatetime(normalizedValidFrom) : null,
        normalizedValidUntil ? toMysqlUtcDatetime(normalizedValidUntil) : null,
        toMysqlUtcDatetime(now),
        toMysqlUtcDatetime(now)
      );

      const placeholders = insertColumns.map(() => '?').join(', ');
      const [result] = await conn.execute(
        `INSERT INTO api_keys (${insertColumns.join(', ')}) VALUES (${placeholders})`,
        insertValues
      );
      keyLast4 = key.slice(-4);
      created = true;
      apiKeyId = result.insertId || null;
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

      const setParts = [
        "status = 'active'",
        'plan_id = ?',
        'customer_email = ?',
        'customer_name = ?',
        'wp_user_id = ?',
        'subscription_status = ?',
        'subscription_id = ?',
      ];

      const params = [
        resolvedPlanId || existing.plan_id || null,
        nextCustomerEmail,
        nextCustomerName,
        nextWpUserId,
        nextSubscriptionStatus,
        nextSubscriptionId,
      ];

      if (externalSubscriptionIdExists) {
        setParts.push('external_subscription_id = ?');
        params.push(nextExternalSubscriptionId ?? nextSubscriptionId);
      }

      setParts.push('order_id = ?', 'license_key = NULL', 'updated_at = NOW()');
      params.push(nextOrderId);

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

    const currentValidFrom = effectiveValidFrom ? toMysqlUtcDatetime(effectiveValidFrom) : null;
    const currentValidUntil = normalizedValidUntil
      ? toMysqlUtcDatetime(normalizedValidUntil)
      : parsedExistingValidUntil
      ? toMysqlUtcDatetime(parsedExistingValidUntil)
      : null;

    await conn.commit();
    return {
      plaintextKey,
      keyPrefix,
      keyLast4,
      planId: resolvedPlanId || planId || null,
      created,
      apiKeyId,
      identityUsed: identityUsed || deriveIdentityUsed({
        wpUserId,
        customerEmail: normalizedEmail,
        subscriptionId,
        orderId,
      }),
      wpUserId: nextWpUserId,
      customerName: nextCustomerName,
      subscriptionStatus: nextSubscriptionStatus,
      subscriptionId: nextSubscriptionId,
      externalSubscriptionId: externalSubscriptionIdExists ? nextExternalSubscriptionId : null,
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

async function applySubscriptionStateChange({
  event = null,
  subscriptionStatus = null,
  validUntil = null,
  providedValidUntil = false,
  customerEmail = null,
  wpUserId = null,
  subscriptionId = null,
  externalSubscriptionId = null,
  orderId = null,
}) {
  if (!subscriptionId && !customerEmail && !wpUserId && !orderId && !externalSubscriptionId) {
    throw new Error('customerEmail, wpUserId, subscriptionId, externalSubscriptionId, or orderId is required.');
  }

  const normalizedEmail = customerEmail ? String(customerEmail).trim().toLowerCase() : null;
  const normalizedEvent = String(event || '').trim().toLowerCase();
  const subscriptionStatusMap = {
    cancelled: 'cancelled',
    canceled: 'cancelled',
    expired: 'expired',
    payment_failed: 'payment_failed',
    paused: 'paused',
    disabled: 'disabled',
  };

  const targetSubscriptionStatus = subscriptionStatus || subscriptionStatusMap[normalizedEvent] || normalizedEvent || null;
  const now = utcNow();

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const externalSubscriptionIdExists = await hasColumn(conn, 'api_keys', 'external_subscription_id');
    const { record: existing, identityUsed } = await findExistingKey(conn, {
      wpUserId,
      customerEmail: normalizedEmail,
      subscriptionId,
      externalSubscriptionId,
      orderId,
    });

    if (!existing) {
      await conn.rollback();
      return {
        affected: 0,
        action: 'not_found',
        subscriptionStatus: targetSubscriptionStatus,
        status: null,
        apiKeyId: null,
        identityUsed: null,
        validUntil: null,
      };
    }

    const parsedExistingValidUntil = parseMysqlUtcDatetime(existing.valid_until ?? null);
    const normalizedValidUntil = providedValidUntil ? validUntil || null : parsedExistingValidUntil;

    let shouldDisableKey = false;
    if (normalizedValidUntil) {
      shouldDisableKey = normalizedValidUntil.getTime() <= now.getTime();
    } else {
      shouldDisableKey = ['disabled', 'expired'].includes(normalizedEvent) || targetSubscriptionStatus === 'disabled';
    }

    const setParts = ['subscription_status = ?', 'updated_at = NOW()'];
    const params = [targetSubscriptionStatus];

    if (providedValidUntil) {
      setParts.push('valid_until = ?');
      params.push(normalizedValidUntil ? toMysqlUtcDatetime(normalizedValidUntil) : null);
    }

    if (shouldDisableKey) {
      setParts.push("status = 'disabled'", 'license_key = NULL');
    }

    if (externalSubscriptionIdExists) {
      setParts.push('external_subscription_id = ?');
      params.push(externalSubscriptionId ?? subscriptionId ?? existing.external_subscription_id ?? null);
    }

    setParts.push('subscription_id = ?', 'order_id = ?', 'wp_user_id = ?', 'customer_email = ?');
    params.push(
      subscriptionId ?? existing.subscription_id ?? null,
      orderId ?? existing.order_id ?? null,
      wpUserId ?? existing.wp_user_id ?? null,
      normalizedEmail ?? existing.customer_email ?? null
    );

    params.push(existing.id);

    const [result] = await conn.execute(
      `UPDATE api_keys
          SET ${setParts.join(', ')}
        WHERE id = ?`,
      params
    );

    await conn.commit();

    const nextStatus = shouldDisableKey ? 'disabled' : normalizeActiveStatus(existing.status || 'active');
    const action = shouldDisableKey ? 'disabled' : result.affectedRows ? 'status_updated' : 'noop';
    const nextValidUntil = normalizedValidUntil
      ? toMysqlUtcDatetime(normalizedValidUntil)
      : parsedExistingValidUntil
      ? toMysqlUtcDatetime(parsedExistingValidUntil)
      : null;

    return {
      affected: result.affectedRows || 0,
      action,
      subscriptionStatus: targetSubscriptionStatus,
      status: nextStatus,
      apiKeyId: existing.id,
      identityUsed,
      validUntil: nextValidUntil,
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function disableCustomerKey({ customerEmail = null, wpUserId = null, subscriptionId = null, orderId = null }) {
  if (!subscriptionId && !customerEmail && !wpUserId && !orderId) {
    throw new Error('customerEmail, wpUserId, subscriptionId, or orderId is required to disable a key');
  }

  const normalizedEmail = customerEmail ? String(customerEmail).trim().toLowerCase() : null;

  const conn = await pool.getConnection();

  try {
    const externalSubscriptionIdExists = await hasColumn(conn, 'api_keys', 'external_subscription_id');

    if (wpUserId) {
      const [result] = await conn.execute(
        `UPDATE api_keys SET status = 'disabled', license_key = NULL, updated_at = NOW() WHERE wp_user_id = ?`,
        [wpUserId]
      );
      if (result.affectedRows) return result.affectedRows;
    }

    if (normalizedEmail) {
      const [result] = await conn.execute(
        `UPDATE api_keys SET status = 'disabled', license_key = NULL, updated_at = NOW() WHERE LOWER(customer_email) = ?`,
        [normalizedEmail]
      );
      if (result.affectedRows) return result.affectedRows;
    }

    if (subscriptionId) {
      const predicates = ['subscription_id = ?'];
      const params = [subscriptionId];

      if (externalSubscriptionIdExists) {
        predicates.push('external_subscription_id = ?');
        params.push(subscriptionId);
      }

      const [result] = await conn.execute(
        `UPDATE api_keys SET status = 'disabled', license_key = NULL, updated_at = NOW() WHERE ${predicates.join(' OR ')}`,
        params
      );
      if (result.affectedRows) return result.affectedRows;
    }

    if (orderId) {
      const [result] = await conn.execute(
        `UPDATE api_keys SET status = 'disabled', license_key = NULL, updated_at = NOW() WHERE order_id = ?`,
        [orderId]
      );
      return result.affectedRows || 0;
    }

    return 0;
  } finally {
    conn.release();
  }
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
  applySubscriptionStateChange,
  disableCustomerKey,
  findCustomerKeyByPlaintext,
  upgradeLegacyKey,
};
