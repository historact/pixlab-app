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

const debugInternal = process.env.DAVIX_DEBUG_INTERNAL === '1';

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
  const graceMs = getValidFromGraceSeconds() * 1000;

  if (validFrom && now < (validFrom.getTime() - graceMs)) return { ok: false, reason: 'not_active_yet' };
  if (validUntil && now > validUntil.getTime()) return { ok: false, reason: 'expired' };
  return { ok: true };
}

async function loadFreePlan(executor = null) {
  if (executor && typeof executor.execute === 'function') {
    const [rows] = await executor.execute('SELECT * FROM plans WHERE plan_slug = ? LIMIT 1', ['free']);
    return rows[0] || null;
  }
  const rows = await query('SELECT * FROM plans WHERE plan_slug = ? LIMIT 1', ['free']);
  return rows[0] || null;
}

function mapPlanRow(row = {}) {
  if (!row) return null;
  const quotaModeRaw = typeof row.quota_mode === 'string' ? row.quota_mode.toLowerCase() : null;
  const quotaMode = ['monthly_total_only', 'monthly_scoped_only', 'monthly_both'].includes(quotaModeRaw)
    ? quotaModeRaw
    : null;
  return {
    id: row.id || row.joined_plan_id || null,
    plan_slug: row.plan_slug || null,
    name: row.plan_name || row.name || null,
    monthly_quota_files: row.monthly_quota ?? row.monthly_quota_files ?? null,
    billing_period: row.billing_period || null,
    is_free: row.is_free === 1 || row.is_free === true,
    timeout_seconds: row.timeout_seconds ?? null,
    timeout_ms: row.timeout_ms ?? null,
    max_files_per_request: row.max_files_per_request ?? null,
    max_total_upload_mb: row.max_total_upload_mb ?? null,
    max_dimension_px: row.max_dimension_px ?? null,
    max_upload_bytes_per_file: row.max_upload_bytes_per_file ?? null,
    allow_h2i: row.allow_h2i ?? null,
    allow_image: row.allow_image ?? null,
    allow_pdf: row.allow_pdf ?? null,
    allow_tools: row.allow_tools ?? null,
    h2i_enabled: row.h2i_enabled ?? null,
    h2i_max_html_chars: row.h2i_max_html_chars ?? null,
    h2i_max_render_width: row.h2i_max_render_width ?? null,
    h2i_max_render_height: row.h2i_max_render_height ?? null,
    h2i_max_render_pixels: row.h2i_max_render_pixels ?? null,
    image_enabled: row.image_enabled ?? null,
    image_max_dimension_px: row.image_max_dimension_px ?? null,
    image_max_total_upload_mb: row.image_max_total_upload_mb ?? null,
    image_max_files_per_request: row.image_max_files_per_request ?? null,
    pdf_enabled: row.pdf_enabled ?? null,
    pdf_max_total_upload_mb: row.pdf_max_total_upload_mb ?? null,
    pdf_max_files_per_request: row.pdf_max_files_per_request ?? null,
    pdf_max_pages_to_images: row.pdf_max_pages_to_images ?? null,
    pdf_max_pages_extract_images: row.pdf_max_pages_extract_images ?? null,
    pdf_max_pages_split: row.pdf_max_pages_split ?? null,
    tools_enabled: row.tools_enabled ?? null,
    tools_max_dimension_px: row.tools_max_dimension_px ?? null,
    tools_max_total_upload_mb: row.tools_max_total_upload_mb ?? null,
    tools_max_files_per_request: row.tools_max_files_per_request ?? null,
    quota_mode: quotaMode,
    monthly_h2i_limit: row.monthly_h2i_limit ?? null,
    monthly_image_limit: row.monthly_image_limit ?? null,
    monthly_pdf_limit: row.monthly_pdf_limit ?? null,
    monthly_tools_limit: row.monthly_tools_limit ?? null,
    burst_limit_per_min: row.burst_limit_per_min ?? null,
    burst_window_seconds: row.burst_window_seconds ?? null,
    burst_applies_to: row.burst_applies_to ?? null,
  };
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
              p.billing_period, p.is_free, p.timeout_seconds, p.timeout_ms,
              p.max_files_per_request, p.max_total_upload_mb, p.max_dimension_px, p.max_upload_bytes_per_file,
              p.allow_h2i, p.allow_image, p.allow_pdf, p.allow_tools,
              p.h2i_enabled, p.h2i_max_html_chars, p.h2i_max_render_width, p.h2i_max_render_height, p.h2i_max_render_pixels,
              p.image_enabled, p.image_max_dimension_px, p.image_max_total_upload_mb, p.image_max_files_per_request,
              p.pdf_enabled, p.pdf_max_total_upload_mb, p.pdf_max_files_per_request,
              p.pdf_max_pages_to_images, p.pdf_max_pages_extract_images, p.pdf_max_pages_split,
              p.tools_enabled, p.tools_max_dimension_px, p.tools_max_total_upload_mb, p.tools_max_files_per_request,
              p.quota_mode, p.monthly_h2i_limit, p.monthly_image_limit, p.monthly_pdf_limit, p.monthly_tools_limit,
              p.burst_limit_per_min, p.burst_window_seconds, p.burst_applies_to
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
      key_id: validity.reason === 'expired' ? rec.id : null,
      hint: validity.reason === 'expired' ? 'Key expired.' : 'Key not active yet.',
    };
  }

  const matches = await verifyApiKeyHash(rec.key_hash, plaintextKey);
  if (!matches) return { key: null, error: 'hash_mismatch' };

  let planDetails = null;
  if (rec.joined_plan_id) {
    planDetails = mapPlanRow(rec);
  }

  if (!planDetails && rec.plan_slug) {
    try {
      const [rows] = await query('SELECT * FROM plans WHERE plan_slug = ? LIMIT 1', [rec.plan_slug]);
      if (rows[0]) {
        planDetails = mapPlanRow(rows[0]);
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
    return {
      key: null,
      error: 'plan_resolution_failed',
      hint: 'Plan resolution failed for this API key. Contact support to repair subscription plan assignment.',
    };
  }

  const monthlyQuota = planDetails?.monthly_quota_files ?? rec.monthly_quota;
  const quotaMode = planDetails?.quota_mode || null;

  return {
    key: {
      id: rec.id,
      status: rec.status,
      plan_id: rec.plan_id || planDetails?.id || null,
      plan_slug: planDetails?.plan_slug || rec.plan_slug || null,
      plan_name: planDetails?.name || rec.plan_name || null,
      monthly_quota: monthlyQuota,
      quota_mode: quotaMode,
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
  { wpUserId = null, customerEmail = null, subscriptionId = null, orderId = null }
) {
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
    const [rows] = await conn.execute(
      `SELECT ${baseFields} FROM api_keys WHERE subscription_id = ? ORDER BY updated_at DESC LIMIT 1`,
      [subscriptionId]
    );
    if (rows.length) return { record: rows[0], identityUsed: { type: 'subscription_id', value: subscriptionId } };
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
  orderId = null,
  subscriptionStatus = null,
  manualValidFrom = null,
  validUntil = null,
  providedValidFrom = false,
  providedValidUntil = false,
  forceImmediateValidFrom = false,
  isLifetime = false,
  allowPlanFallback = false,
  allowStatusReactivate = false,
  eventType = null,
  callerPath = null,
}) {
  const conn = await pool.getConnection();
  let plaintextKey = null;
  let keyPrefix = null;
  let keyLast4 = null;
  let resolvedPlanId = null;
  let planSource = null;
  let created = false;
  const graceSeconds = getValidFromGraceSeconds();
  const normalizedEmail = customerEmail ? String(customerEmail).trim().toLowerCase() : null;
  const parsedWpUserId = Number(wpUserId);
  const normalizedWpUserId =
    wpUserId !== undefined && wpUserId !== null && wpUserId !== '' && Number.isFinite(parsedWpUserId) && parsedWpUserId !== 0
      ? parsedWpUserId
      : null;
  const now = utcNow();

  try {
    await conn.beginTransaction();
    await conn.execute('UPDATE api_keys SET license_key = NULL WHERE license_key = ""');
    const { record: existing, identityUsed } = await findExistingKey(conn, {
      wpUserId: normalizedWpUserId,
      customerEmail: normalizedEmail,
      subscriptionId,
      orderId,
    });
    if (planId || planSlug) {
      resolvedPlanId = await resolvePlanId(conn, { planId, planSlug });
      planSource = 'input';
    } else if (existing?.plan_id) {
      resolvedPlanId = existing.plan_id;
      planSource = 'existing';
    } else if (allowPlanFallback) {
      const freePlan = await loadFreePlan(conn);
      if (freePlan) {
        resolvedPlanId = freePlan.id;
        planSource = 'free_fallback';
      }
    }

    if (!resolvedPlanId && !existing && !planId && !planSlug) {
      const err = new Error(
        allowPlanFallback
          ? 'plan_id or plan_slug is required (free plan unavailable).'
          : 'plan_id or plan_slug is required.'
      );
      err.code = 'PLAN_NOT_FOUND';
      throw err;
    }

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

    if (isLifetime) {
      normalizedValidUntil = null;
      shouldUpdateValidUntil = true;
    } else if (providedValidUntil) {
      normalizedValidUntil = validUntil || null;
      shouldUpdateValidUntil = true;
    } else if (existing) {
      normalizedValidUntil = parsedExistingValidUntil;
    } else {
      normalizedValidUntil = null;
      shouldUpdateValidUntil = true;
    }

    const effectiveValidFrom = shouldUpdateValidFrom ? normalizedValidFrom : parsedExistingValidFrom;
    const shouldValidateOrdering = !isLifetime && effectiveValidFrom && normalizedValidUntil && providedValidFrom && providedValidUntil;
    if (shouldValidateOrdering && normalizedValidUntil.getTime() <= effectiveValidFrom.getTime()) {
      const err = new Error('valid_until must be after valid_from');
      err.code = 'INVALID_PARAMETER';
      err.message = 'valid_until must be after valid_from.';
      throw err;
    }

    const nextCustomerEmail = normalizedEmail ?? (existing?.customer_email || null);
    const nextCustomerName = customerName ?? existing?.customer_name ?? null;
    const existingWpUserId = existing?.wp_user_id ?? null;
    let nextWpUserId = existingWpUserId;

    if (normalizedWpUserId !== null && normalizedWpUserId !== undefined) {
      if (!existingWpUserId || existingWpUserId === 0) {
        console.log('[DAVIX][internal] applying wp_user_id during provisioning', {
          wp_user_id: normalizedWpUserId,
          api_key_id: existing?.id || null,
        });
        nextWpUserId = normalizedWpUserId;
      }
    } else if (existingWpUserId === null || existingWpUserId === undefined) {
      nextWpUserId = null;
    }
    const incomingSubscriptionStatus = subscriptionStatus ?? existing?.subscription_status ?? null;
    const existingSubscriptionStatus = existing?.subscription_status ?? null;
    const isStickyExisting =
      existingSubscriptionStatus &&
      ['cancelled', 'expired'].includes(String(existingSubscriptionStatus).toLowerCase());
    let preservedStickyStatus = false;
    let nextSubscriptionStatus = incomingSubscriptionStatus;
    if (existing && isStickyExisting && !allowStatusReactivate) {
      nextSubscriptionStatus = existingSubscriptionStatus;
      preservedStickyStatus = incomingSubscriptionStatus !== existingSubscriptionStatus;
    }
    const nextSubscriptionId = subscriptionId ?? existing?.subscription_id ?? null;
    const nextOrderId = orderId ?? existing?.order_id ?? null;

    if (debugInternal) {
      console.log('[DAVIX][internal] subscription status guard', {
        caller_path: callerPath || null,
        event_type: eventType || null,
        allow_status_reactivate: allowStatusReactivate,
        existing_subscription_status: existingSubscriptionStatus,
        incoming_subscription_status: incomingSubscriptionStatus,
        next_subscription_status: nextSubscriptionStatus,
        preserved_sticky_status: preservedStickyStatus,
      });
    }

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
      : shouldUpdateValidUntil
      ? null
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
      planSource,
      identityUsed:
        identityUsed ||
        deriveIdentityUsed({
          wpUserId: normalizedWpUserId,
          customerEmail: normalizedEmail,
          subscriptionId,
          orderId,
        }),
      wpUserId: nextWpUserId,
      customerName: nextCustomerName,
      subscriptionStatus: nextSubscriptionStatus,
      subscriptionId: nextSubscriptionId,
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

async function ensureApiKeyForWpUser({
  wpUserId = null,
  customerEmail = null,
  customerName = null,
  planId = null,
  planSlug = null,
  subscriptionId = null,
  orderId = null,
  subscriptionStatus = null,
  manualValidFrom = null,
  validUntil = null,
  providedValidFrom = false,
  providedValidUntil = false,
  allowStatusReactivate = false,
  eventType = null,
  callerPath = null,
} = {}) {
  return activateOrProvisionKey({
    wpUserId,
    customerEmail,
    customerName,
    planId,
    planSlug,
    subscriptionId,
    orderId,
    subscriptionStatus,
    manualValidFrom,
    validUntil,
    providedValidFrom,
    providedValidUntil,
    allowPlanFallback: true,
    allowStatusReactivate,
    eventType,
    callerPath,
  });
}

async function applySubscriptionStateChange({
  event = null,
  subscriptionStatus = null,
  validUntil = null,
  providedValidUntil = false,
  customerEmail = null,
  wpUserId = null,
  subscriptionId = null,
  orderId = null,
  allowIdentityOverwrite = false,
  callerPath = null,
}) {
  if (!subscriptionId && !customerEmail && !wpUserId && !orderId) {
    throw new Error('customerEmail, wpUserId, subscriptionId, or orderId is required.');
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

  const incomingSubscriptionStatus = subscriptionStatus || null;
  const isCancellationEvent = ['cancelled', 'canceled'].includes(normalizedEvent);
  const targetSubscriptionStatus = isCancellationEvent
    ? 'cancelled'
    : incomingSubscriptionStatus || subscriptionStatusMap[normalizedEvent] || normalizedEvent || null;
  const now = utcNow();
  const hasValue = value => value !== null && value !== undefined && value !== '';

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { record: existing, identityUsed } = await findExistingKey(conn, {
      wpUserId,
      customerEmail: normalizedEmail,
      subscriptionId,
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

    const isHardDisableEvent =
      ['expired', 'disabled'].includes(normalizedEvent) || ['expired', 'disabled'].includes(targetSubscriptionStatus);

    let shouldDisableKey = false;
    if (isHardDisableEvent) {
      shouldDisableKey = true;
    } else if (normalizedValidUntil) {
      shouldDisableKey = normalizedValidUntil.getTime() <= now.getTime();
    } else {
      shouldDisableKey = false;
    }

    const shouldClearPlanAndValidity = false;

    if (debugInternal) {
      console.log('[DAVIX][internal] subscription state change', {
        caller_path: callerPath || null,
        event_type: normalizedEvent,
        existing_subscription_status: existing.subscription_status || null,
        incoming_subscription_status: incomingSubscriptionStatus,
        target_subscription_status: targetSubscriptionStatus,
        is_cancellation_event: isCancellationEvent,
        shouldDisableKey,
        shouldClearPlanAndValidity,
        providedValidUntil,
        normalizedValidUntil: normalizedValidUntil ? normalizedValidUntil.toISOString() : null,
      });
    }

    const shouldBackfillSubscriptionId =
      allowIdentityOverwrite || (!hasValue(existing.subscription_id) && hasValue(subscriptionId));
    const shouldBackfillOrderId = allowIdentityOverwrite || (!hasValue(existing.order_id) && hasValue(orderId));
    const shouldBackfillWpUserId = allowIdentityOverwrite || (!hasValue(existing.wp_user_id) && hasValue(wpUserId));
    const shouldBackfillCustomerEmail =
      allowIdentityOverwrite || (!hasValue(existing.customer_email) && hasValue(normalizedEmail));

    const buildUpdate = includeClearPlanAndValidity => {
      const setParts = ['subscription_status = ?', 'updated_at = NOW()'];
      const params = [targetSubscriptionStatus];

      if (providedValidUntil && !includeClearPlanAndValidity) {
        setParts.push('valid_until = ?');
        params.push(normalizedValidUntil ? toMysqlUtcDatetime(normalizedValidUntil) : null);
      }

      if (shouldDisableKey) {
        setParts.push("status = 'disabled'", 'license_key = NULL');
      }

      if (shouldBackfillSubscriptionId) {
        setParts.push('subscription_id = ?');
        params.push(subscriptionId ?? null);
      }

      if (shouldBackfillOrderId) {
        setParts.push('order_id = ?');
        params.push(orderId ?? null);
      }

      if (shouldBackfillWpUserId) {
        setParts.push('wp_user_id = ?');
        params.push(wpUserId ?? null);
      }

      if (shouldBackfillCustomerEmail) {
        setParts.push('customer_email = ?');
        params.push(normalizedEmail ?? null);
      }

      params.push(existing.id);

      return { setParts, params };
    };

    const isPlanNullConstraintError = err =>
      ['ER_NO_REFERENCED_ROW', 'ER_NO_REFERENCED_ROW_2', 'ER_ROW_IS_REFERENCED', 'ER_ROW_IS_REFERENCED_2', 'ER_BAD_NULL_ERROR'].includes(
        err?.code
      );

    const attemptUpdate = async includeClearPlanAndValidity => {
      const { setParts, params } = buildUpdate(includeClearPlanAndValidity);
      const [result] = await conn.execute(
        `UPDATE api_keys
            SET ${setParts.join(', ')}
          WHERE id = ?`,
        params
      );
      return result;
    };

    let result;
    let usedClearPlanAndValidity = shouldClearPlanAndValidity;
    try {
      result = await attemptUpdate(shouldClearPlanAndValidity);
    } catch (err) {
      if (shouldClearPlanAndValidity && isPlanNullConstraintError(err)) {
        console.warn(
          '[DAVIX][internal] plan/validity clear failed due to schema; retrying without nulling plan/validity',
          err.code || err.message
        );
        usedClearPlanAndValidity = false;
        result = await attemptUpdate(false);
      } else {
        throw err;
      }
    }

    await conn.commit();

    const nextStatus = shouldDisableKey ? 'disabled' : normalizeActiveStatus(existing.status || 'active');
    const action = shouldDisableKey ? 'disabled' : result.affectedRows ? 'status_updated' : 'noop';
    const nextValidUntil =
      usedClearPlanAndValidity && shouldDisableKey
        ? null
        : normalizedValidUntil
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
      const [result] = await conn.execute(
        `UPDATE api_keys SET status = 'disabled', license_key = NULL, updated_at = NOW() WHERE subscription_id = ?`,
        [subscriptionId]
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
  ensureApiKeyForWpUser,
  applySubscriptionStateChange,
  disableCustomerKey,
  findCustomerKeyByPlaintext,
  withinValidityWindow,
  upgradeLegacyKey,
};
