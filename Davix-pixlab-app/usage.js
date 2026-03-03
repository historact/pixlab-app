const { randomUUID } = require('crypto');
const { pool, query } = require('./db');
const { logError, logInfo } = require('./utils/logger');
const {
  getRequestLogColumns,
  insertRequestLogRow,
} = require('./utils/requestLog');
const { getLedgerEnabled, getLedgerTtlSeconds } = require('./utils/config');

function humanizeErrorCode(code) {
  const normalized = (code || '').toString().toLowerCase();
  switch (normalized) {
    case 'invalid_api_key':
      return 'Invalid API key.';
    case 'monthly_quota_exceeded':
      return 'Monthly quota exceeded.';
    case 'missing_field':
      return 'Required field is missing.';
    case 'html_render_failed':
      return 'Failed to render HTML.';
    case 'image_processing_failed':
      return 'Failed to process image.';
    case 'pdf_tool_failed':
      return 'Failed to process PDF.';
    case 'tool_processing_failed':
      return 'Failed to run tool.';
    default:
      return 'Request failed.';
  }
}

const REQUEST_ID_MAX_LENGTH = 128;

function normalizeRequestId(requestId) {
  if (typeof requestId === 'string' && requestId.trim()) {
    return requestId.trim().slice(0, REQUEST_ID_MAX_LENGTH);
  }
  return randomUUID();
}

function normalizeDedupeId(requestId) {
  if (typeof requestId === 'string' && requestId.trim()) {
    return requestId.trim().slice(0, REQUEST_ID_MAX_LENGTH);
  }
  return null;
}

function getCalendarPeriodUTC() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

function parseUtcDate(input) {
  if (!input) return null;
  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? null : new Date(input.getTime());
  }
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) return null;
    let normalized = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T');
    if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(normalized)) {
      normalized = `${normalized}Z`;
    }
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(input);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatUTCDateYYYYMMDD(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(
    date.getUTCDate()
  ).padStart(2, '0')}`;
}

function getValidityBoundsUTC(keyRecord = {}) {
  return {
    start: parseUtcDate(keyRecord.valid_from ?? null),
    end: parseUtcDate(keyRecord.valid_until ?? null),
  };
}

function getCyclePeriodKeyFromBounds(start, end) {
  const startValue = formatUTCDateYYYYMMDD(start);
  const endValue = formatUTCDateYYYYMMDD(end);
  if (!startValue || !endValue) return null;
  return `cycle:${startValue}_${endValue}`;
}

function getCyclePeriodKey(validFrom, validUntil) {
  const { start, end } = getValidityBoundsUTC({ valid_from: validFrom, valid_until: validUntil });
  return getCyclePeriodKeyFromBounds(start, end);
}

function getUsagePeriodForKey(keyRecord = {}, plan = null) {
  const { start, end } = getValidityBoundsUTC(keyRecord);
  const cycleKey = getCyclePeriodKeyFromBounds(start, end);
  if (cycleKey) return cycleKey;

  const planSlug = typeof plan?.plan_slug === 'string' ? plan.plan_slug.toLowerCase() : null;
  const isFreePlan = plan?.is_free === true || plan?.is_free === 1 || planSlug === 'free';
  if (isFreePlan) {
    return getCalendarPeriodUTC();
  }

  return getCalendarPeriodUTC();
}

function getCurrentPeriod() {
  return getCalendarPeriodUTC();
}

async function getOrCreateUsageForKey(apiKeyId, period = getCalendarPeriodUTC(), monthlyQuota) {
  try {
    const rows = await query(
      `SELECT id, period, used_files, used_bytes, total_calls, total_files_processed,
              reserved_files,
              h2i_calls, h2i_files, image_calls, image_files, pdf_calls, pdf_files,
              tools_calls, tools_files, bytes_in, bytes_out, errors, last_error_code,
              last_error_message, last_request_at, created_at, updated_at
       FROM usage_monthly
       WHERE api_key_id = ? AND period = ?
       LIMIT 1`,
      [apiKeyId, period]
    );

    if (rows.length) {
      return { ...rows[0], limit: monthlyQuota };
    }

    let result;
    try {
      [result] = await pool.execute(
        `INSERT INTO usage_monthly (
            api_key_id, period, used_files, reserved_files, used_bytes, total_calls, total_files_processed,
            h2i_calls, h2i_files, image_calls, image_files, pdf_calls, pdf_files,
            tools_calls, tools_files, bytes_in, bytes_out, errors, last_error_code,
            last_error_message, last_request_at, created_at, updated_at
          )
          VALUES (?, ?, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, NULL, NULL, NULL, NOW(), NOW())`,
        [apiKeyId, period]
      );
    } catch (err) {
      if (err && err.code === 'ER_DUP_ENTRY') {
        const existingRows = await query(
          `SELECT id, period, used_files, used_bytes, total_calls, total_files_processed,
                  reserved_files,
                  h2i_calls, h2i_files, image_calls, image_files, pdf_calls, pdf_files,
                  tools_calls, tools_files, bytes_in, bytes_out, errors, last_error_code,
                  last_error_message, last_request_at, created_at, updated_at
           FROM usage_monthly
           WHERE api_key_id = ? AND period = ?
           LIMIT 1`,
          [apiKeyId, period]
        );
        if (existingRows.length) {
          return { ...existingRows[0], limit: monthlyQuota };
        }
      }
      throw err;
    }

    return {
      id: result.insertId,
      period,
      used_files: 0,
      reserved_files: 0,
      used_bytes: 0,
      total_calls: 0,
      total_files_processed: 0,
      h2i_calls: 0,
      h2i_files: 0,
      image_calls: 0,
      image_files: 0,
      pdf_calls: 0,
      pdf_files: 0,
      tools_calls: 0,
      tools_files: 0,
      bytes_in: 0,
      bytes_out: 0,
      errors: 0,
      last_error_code: null,
      last_error_message: null,
      last_request_at: null,
      created_at: new Date(),
      updated_at: new Date(),
      limit: monthlyQuota,
    };
  } catch (err) {
    logError('usage.getOrCreateUsageForKey.failed', {
      api_key_id: apiKeyId,
      period,
      message: err.message,
      code: err.code,
      stack: err.stack,
    });
    throw err;
  }
}

function checkMonthlyQuota(usage, monthlyQuota, filesToConsume) {
  const limit = Number.isFinite(monthlyQuota) ? monthlyQuota : null;
  if (!limit) return { allowed: true, remaining: null };
  const reserved = Number(usage.reserved_files) || 0;
  const remaining = limit - (usage.used_files + reserved);
  return { allowed: remaining >= filesToConsume, remaining };
}

function endpointUsageColumn(endpoint) {
  const endpointKey = (endpoint || '').toLowerCase();
  if (endpointKey.startsWith('/v1/h2i') || endpointKey === 'h2i') return 'h2i_files';
  if (endpointKey.startsWith('/v1/image') || endpointKey === 'image') return 'image_files';
  if (endpointKey.startsWith('/v1/pdf') || endpointKey === 'pdf') return 'pdf_files';
  if (endpointKey.startsWith('/v1/tools') || endpointKey === 'tools') return 'tools_files';
  return null;
}

function resolveQuotaPolicy({ plan = null, endpoint = null } = {}) {
  const planModeRaw = typeof plan?.quota_mode === 'string' ? plan.quota_mode.toLowerCase() : null;
  const mode = ['monthly_total_only', 'monthly_scoped_only', 'monthly_both'].includes(planModeRaw)
    ? planModeRaw
    : 'monthly_total_only';

  const totalLimit = Number.isFinite(Number(plan?.monthly_quota_files))
    ? Number(plan.monthly_quota_files)
    : null;

  const column = endpointUsageColumn(endpoint);
  const scopedMap = {
    h2i_files: Number.isFinite(Number(plan?.monthly_h2i_limit)) ? Number(plan.monthly_h2i_limit) : null,
    image_files: Number.isFinite(Number(plan?.monthly_image_limit)) ? Number(plan.monthly_image_limit) : null,
    pdf_files: Number.isFinite(Number(plan?.monthly_pdf_limit)) ? Number(plan.monthly_pdf_limit) : null,
    tools_files: Number.isFinite(Number(plan?.monthly_tools_limit)) ? Number(plan.monthly_tools_limit) : null,
  };
  const scopedLimit = column ? scopedMap[column] : null;

  return {
    mode,
    totalLimit,
    scopedLimit,
    scopedColumn: column,
    enforceTotal: mode === 'monthly_total_only' || mode === 'monthly_both',
    enforceScoped: (mode === 'monthly_scoped_only' || mode === 'monthly_both') && Boolean(column),
  };
}

async function reserveQuota({
  apiKeyId,
  period,
  filesToReserve,
  monthlyQuota,
  plan = null,
  requestId = null,
  endpoint = null,
  db = pool,
}) {
  const usage = await getOrCreateUsageForKey(apiKeyId, period, monthlyQuota);
  const policy = resolveQuotaPolicy({ plan, endpoint });
  const limit = policy.totalLimit;
  const reserveCount = Math.max(Number(filesToReserve) || 0, 0);
  if (!reserveCount) {
    return { allowed: true, usage, remaining: limit ? limit - (usage.used_files + usage.reserved_files) : null };
  }

  if (policy.enforceTotal && !Number.isFinite(limit)) {
    return {
      allowed: false,
      usage,
      remaining: null,
      error: 'plan_quota_not_configured',
      hint: 'Plan monthly_quota_files must be configured when total quota enforcement is enabled.',
    };
  }

  const params = [reserveCount, apiKeyId, period];
  const conditions = [];
  let sql = `UPDATE usage_monthly
           SET reserved_files = reserved_files + ?
           WHERE api_key_id = ? AND period = ?`;
  if (policy.enforceTotal && Number.isFinite(limit)) {
    conditions.push('(used_files + reserved_files + ?) <= ?');
    params.push(reserveCount, limit);
  }
  if (policy.enforceScoped && Number.isFinite(policy.scopedLimit) && policy.scopedColumn) {
    conditions.push(`(${policy.scopedColumn} + ?) <= ?`);
    params.push(reserveCount, policy.scopedLimit);
  }
  if (conditions.length) {
    sql += `\n             AND ${conditions.join('\n             AND ')}`;
  }

  const ledgerEnabled = getLedgerEnabled();
  const dedupeId = normalizeDedupeId(requestId);
  let conn;
  let shouldRelease = false;
  let affected = 0;
  let duplicateLedger = false;
  let ledgerStatus = null;

  try {
    if (ledgerEnabled && dedupeId) {
      conn = db.getConnection ? await db.getConnection() : db;
      shouldRelease = Boolean(db.getConnection && conn && conn.release);
      if (typeof conn.beginTransaction === 'function') {
        await conn.beginTransaction();
      }
      const ttlSeconds = getLedgerTtlSeconds();
      try {
        await conn.execute(
          `INSERT INTO quota_ledger (
              api_key_id, period, dedupe_id, endpoint, action,
              reserve_units, finalized_units, status, expires_at, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, 0, 'reserved', DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND), NOW(), NOW())`,
          [apiKeyId, period, dedupeId, endpoint, null, reserveCount, ttlSeconds]
        );
      } catch (err) {
        if (err && err.code === 'ER_DUP_ENTRY') {
          duplicateLedger = true;
          const [rows] = await conn.execute(
            'SELECT status, reserve_units, finalized_units FROM quota_ledger WHERE api_key_id = ? AND dedupe_id = ? LIMIT 1',
            [apiKeyId, dedupeId]
          );
          ledgerStatus = rows?.[0]?.status || null;
          if (typeof conn.rollback === 'function') {
            await conn.rollback();
          }
        } else {
          throw err;
        }
      }

      if (!duplicateLedger) {
        const [result] = await conn.execute(sql, params);
        affected = result?.affectedRows || 0;
        if (affected === 0 && typeof conn.rollback === 'function') {
          await conn.rollback();
        } else if (typeof conn.commit === 'function') {
          await conn.commit();
        }
      }
    } else {
      const [result] = await db.execute(sql, params);
      affected = result?.affectedRows || 0;
    }
  } catch (err) {
    if (conn && typeof conn.rollback === 'function') {
      try {
        await conn.rollback();
      } catch (rollbackErr) {
        logError('usage.reserveQuota.rollback_failed', {
          message: rollbackErr.message,
          code: rollbackErr.code,
        });
      }
    }
    logError('usage.reserveQuota.failed', {
      api_key_id: apiKeyId,
      period,
      endpoint,
      message: err.message,
      code: err.code,
    });
    throw err;
  } finally {
    if (shouldRelease && conn) {
      conn.release();
    }
  }

  if (duplicateLedger) {
    const remaining = limit ? limit - (usage.used_files + (usage.reserved_files || 0)) : null;
    return { allowed: true, usage, remaining, duplicate: true, ledgerStatus };
  }

  const decision = affected === 0 ? 'deny' : 'allow';
  logInfo('usage.reserveQuota.decision', {
    api_key_id: apiKeyId,
    period,
    monthly_quota: monthlyQuota ?? null,
    quota_mode: policy.mode,
    monthly_total_quota: policy.totalLimit,
    monthly_scoped_limit: policy.scopedLimit,
    monthly_scoped_column: policy.scopedColumn,
    used_files: usage.used_files ?? 0,
    reserved_files: usage.reserved_files ?? 0,
    filesToReserve: reserveCount,
    affectedRows: affected,
    decision,
  });
  if (affected === 0) {
    const remaining = limit ? limit - (usage.used_files + (usage.reserved_files || 0)) : null;
    return { allowed: false, usage, remaining };
  }

  return { allowed: true, usage, remaining: limit ? limit - (usage.used_files + (usage.reserved_files || 0) + reserveCount) : null };
}

async function finalizeQuota({
  apiKeyId,
  period,
  reservedToFinalize,
  filesReceived = null,
  requestId = null,
  endpoint,
  action,
  bytesIn = 0,
  bytesOut = 0,
  statusCode = 200,
  ip = null,
  userAgent = null,
  paramsForLog = null,
  db = pool,
}) {
  const finalizeCount = Math.max(Number(reservedToFinalize) || 0, 0);
  if (!finalizeCount) return { finalized: false };
  const filesReceivedCount =
    filesReceived === null || filesReceived === undefined
      ? finalizeCount
      : Math.max(Number(filesReceived) || 0, 0);

  const endpointKey = (endpoint || '').toLowerCase();
  const updateFields = [
    'reserved_files = GREATEST(reserved_files - ?, 0)',
    'used_files = used_files + ?',
    'used_bytes = used_bytes + ?',
    'total_calls = total_calls + 1',
    'total_files_processed = total_files_processed + ?',
    'bytes_in = bytes_in + ?',
    'bytes_out = bytes_out + ?',
    'last_request_at = NOW()',
    'updated_at = NOW()',
  ];
  const updateValues = [
    finalizeCount,
    finalizeCount,
    bytesOut,
    filesReceivedCount,
    bytesIn,
    bytesOut,
  ];

  if (endpointKey.startsWith('/v1/h2i') || endpointKey === 'h2i') {
    updateFields.push('h2i_calls = h2i_calls + 1', 'h2i_files = h2i_files + ?');
    updateValues.push(filesReceivedCount);
  } else if (endpointKey.startsWith('/v1/image') || endpointKey === 'image') {
    updateFields.push('image_calls = image_calls + 1', 'image_files = image_files + ?');
    updateValues.push(filesReceivedCount);
  } else if (endpointKey.startsWith('/v1/pdf') || endpointKey === 'pdf') {
    updateFields.push('pdf_calls = pdf_calls + 1', 'pdf_files = pdf_files + ?');
    updateValues.push(filesReceivedCount);
  } else if (endpointKey.startsWith('/v1/tools') || endpointKey === 'tools') {
    updateFields.push('tools_calls = tools_calls + 1', 'tools_files = tools_files + ?');
    updateValues.push(filesReceivedCount);
  }

  updateValues.push(apiKeyId, period);
  const updateSql = `UPDATE usage_monthly SET ${updateFields.join(', ')} WHERE api_key_id = ? AND period = ?`;

  const sanitizedParams = {};
  if (paramsForLog && typeof paramsForLog === 'object') {
    for (const [key, value] of Object.entries(paramsForLog)) {
      const lowerKey = key.toLowerCase();
      if (['api_key', 'key', 'license_key', 'bridge_token', 'token'].includes(lowerKey)) continue;
      sanitizedParams[key] = value;
    }
  }

  const safeRequestId = normalizeRequestId(requestId);
  const dedupeId = normalizeDedupeId(requestId);
  const logRow = {
    api_key_id: apiKeyId,
    request_id: safeRequestId,
    timestamp: new Date(),
    endpoint,
    action,
    status: 'success',
    ip: ip || null,
    user_agent: userAgent || null,
    bytes_in: bytesIn,
    bytes_out: bytesOut,
    files_processed: filesReceivedCount,
    error_code: null,
    error_message: null,
    params_json: JSON.stringify(sanitizedParams),
  };

  const availableCols = await getRequestLogColumns().catch(() => []);
  const cols = Object.keys(logRow).filter(col => availableCols.includes(col));
  const placeholders = cols.map(() => '?').join(', ');
  const values = cols.map(col => logRow[col]);
  const insertSql = cols.length ? `INSERT INTO request_log (${cols.join(', ')}) VALUES (${placeholders})` : null;

  const releaseSql =
    'UPDATE usage_monthly SET reserved_files = GREATEST(reserved_files - ?, 0), updated_at = NOW() WHERE api_key_id = ? AND period = ?';
  const ledgerEnabled = getLedgerEnabled();
  const ledgerUpdateSql = ledgerEnabled && dedupeId
    ? `UPDATE quota_ledger
         SET status = 'finalized',
             finalized_units = GREATEST(finalized_units, ?),
             endpoint = COALESCE(endpoint, ?),
             action = COALESCE(?, action),
             updated_at = NOW()
       WHERE api_key_id = ? AND dedupe_id = ?
         AND status IN ('reserved', 'finalized')`
    : null;

  if (safeRequestId && insertSql) {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      try {
        await conn.execute(insertSql, values);
      } catch (insertErr) {
        if (insertErr && insertErr.code === 'ER_DUP_ENTRY') {
          await conn.rollback();
          let reservedReleased = false;
          if (ledgerEnabled && dedupeId) {
            try {
              const [rows] = await conn.execute(
                'SELECT status FROM quota_ledger WHERE api_key_id = ? AND dedupe_id = ? LIMIT 1',
                [apiKeyId, dedupeId]
              );
              const status = rows?.[0]?.status || null;
              if (status === 'reserved') {
                await conn.execute(releaseSql, [finalizeCount, apiKeyId, period]);
                reservedReleased = true;
              }
            } catch (ledgerErr) {
              await conn.execute(releaseSql, [finalizeCount, apiKeyId, period]);
              reservedReleased = true;
              logError('usage.finalizeQuota.ledger_check_failed', {
                message: ledgerErr.message,
                code: ledgerErr.code,
              });
            }
          } else {
            await conn.execute(releaseSql, [finalizeCount, apiKeyId, period]);
            reservedReleased = true;
          }
          return { finalized: false, duplicate: true, reservedReleased };
        }
        throw insertErr;
      }
      await conn.execute(updateSql, updateValues);
      if (ledgerUpdateSql) {
        await conn.execute(ledgerUpdateSql, [finalizeCount, endpoint, action, apiKeyId, dedupeId]);
      }
      await conn.commit();
      return { finalized: true };
    } catch (err) {
      try {
        await conn.rollback();
      } catch (rollbackErr) {
        logError('usage.finalizeQuota.rollback_failed', {
          message: rollbackErr.message,
          code: rollbackErr.code,
        });
      }
      throw err;
    } finally {
      conn.release();
    }
  }

  await db.execute(updateSql, updateValues);
  if (ledgerUpdateSql) {
    try {
      await db.execute(ledgerUpdateSql, [finalizeCount, endpoint, action, apiKeyId, dedupeId]);
    } catch (ledgerErr) {
      logError('usage.finalizeQuota.ledger_update_failed', {
        message: ledgerErr.message,
        code: ledgerErr.code,
      });
    }
  }
  if (insertSql) {
    await insertRequestLogRow(logRow);
  }
  return { finalized: true };
}

async function refundQuota({
  apiKeyId,
  period,
  reservedToRefund,
  requestId = null,
  endpoint = null,
  db = pool,
}) {
  const refundCount = Math.max(Number(reservedToRefund) || 0, 0);
  if (!refundCount) return { refunded: false };
  try {
    await db.execute(
      `UPDATE usage_monthly
       SET reserved_files = CASE WHEN reserved_files >= ? THEN reserved_files - ? ELSE 0 END
       WHERE api_key_id = ? AND period = ?`,
      [refundCount, refundCount, apiKeyId, period]
    );
    const ledgerEnabled = getLedgerEnabled();
    const dedupeId = normalizeDedupeId(requestId);
    if (ledgerEnabled && dedupeId) {
      try {
        await db.execute(
          `UPDATE quota_ledger
              SET status = 'refunded',
                  updated_at = NOW()
            WHERE api_key_id = ? AND dedupe_id = ?
              AND status IN ('reserved', 'finalized')`,
          [apiKeyId, dedupeId]
        );
      } catch (ledgerErr) {
        logError('usage.refundQuota.ledger_update_failed', {
          api_key_id: apiKeyId,
          period,
          endpoint,
          request_id: requestId || null,
          message: ledgerErr.message,
          code: ledgerErr.code,
        });
      }
    }
    return { refunded: true };
  } catch (err) {
    logError('usage.refundQuota.failed', {
      api_key_id: apiKeyId,
      period,
      endpoint,
      request_id: requestId || null,
      message: err.message,
      code: err.code,
    });
    return { refunded: false };
  }
}

async function recordUsageAndLog({
  apiKeyRecord,
  endpoint,
  action,
  filesReceived = 0,
  filesConsumed = null,
  bytesIn = 0,
  bytesOut = 0,
  status = null,
  ip = null,
  userAgent = null,
  ok = true,
  errorCode = null,
  errorMessage = null,
  paramsForLog = null,
  usagePeriod = null,
  requestId = null,
}) {
  try {
    if (!apiKeyRecord || apiKeyRecord.status !== 'active') return;

    const endpointKey = (endpoint || '').toLowerCase();
    const normalizedEndpoint = endpoint || null;
    const filesReceivedCount = Number(filesReceived) || 0;
    const filesConsumedCount =
      filesConsumed === null || filesConsumed === undefined
        ? filesReceivedCount
        : Math.max(Number(filesConsumed) || 0, 0);
    const inBytes = Number(bytesIn) || 0;
    const outBytes = Number(bytesOut) || 0;
    const finalStatus = ok === true ? 'success' : 'error';
    const safeErrorCode = errorCode || null;
    let safeErrorMessage = null;

    if (finalStatus === 'error') {
      if (typeof errorMessage === 'string' && errorMessage.trim()) {
        safeErrorMessage = errorMessage.trim().slice(0, 500);
      } else if (safeErrorCode) {
        safeErrorMessage = humanizeErrorCode(safeErrorCode);
      } else {
        safeErrorMessage = 'Request failed.';
      }
    }

    const period = usagePeriod || getUsagePeriodForKey(apiKeyRecord, apiKeyRecord?.plan);
    await getOrCreateUsageForKey(apiKeyRecord.id, period, apiKeyRecord.monthly_quota);

    const updateFields = [
      'used_files = used_files + ?',
      'used_bytes = used_bytes + ?',
      'total_calls = total_calls + 1',
      'total_files_processed = total_files_processed + ?',
      'bytes_in = bytes_in + ?',
      'bytes_out = bytes_out + ?',
      'last_request_at = NOW()',
      'updated_at = NOW()',
    ];
    const updateValues = [filesConsumedCount, outBytes, filesReceivedCount, inBytes, outBytes];

    if (endpointKey.startsWith('/v1/h2i') || endpointKey === 'h2i') {
      updateFields.push('h2i_calls = h2i_calls + 1', 'h2i_files = h2i_files + ?');
      updateValues.push(filesReceivedCount);
    } else if (endpointKey.startsWith('/v1/image') || endpointKey === 'image') {
      updateFields.push('image_calls = image_calls + 1', 'image_files = image_files + ?');
      updateValues.push(filesReceivedCount);
    } else if (endpointKey.startsWith('/v1/pdf') || endpointKey === 'pdf') {
      updateFields.push('pdf_calls = pdf_calls + 1', 'pdf_files = pdf_files + ?');
      updateValues.push(filesReceivedCount);
    } else if (endpointKey.startsWith('/v1/tools') || endpointKey === 'tools') {
      updateFields.push('tools_calls = tools_calls + 1', 'tools_files = tools_files + ?');
      updateValues.push(filesReceivedCount);
    }

    if (finalStatus === 'error') {
      updateFields.push('errors = errors + 1', 'last_error_code = ?', 'last_error_message = ?');
      updateValues.push(safeErrorCode, safeErrorMessage);
    }

    updateValues.push(apiKeyRecord.id, period);

    const updateSql = `UPDATE usage_monthly SET ${updateFields.join(', ')} WHERE api_key_id = ? AND period = ?`;

    const sanitizedParams = {};
    if (paramsForLog && typeof paramsForLog === 'object') {
      for (const [key, value] of Object.entries(paramsForLog)) {
        const lowerKey = key.toLowerCase();
        if (['api_key', 'key', 'license_key', 'bridge_token', 'token'].includes(lowerKey)) continue;
        sanitizedParams[key] = value;
      }
    }

    const safeRequestId = normalizeRequestId(requestId);
    const logRow = {
      api_key_id: apiKeyRecord.id,
      request_id: safeRequestId,
      timestamp: new Date(),
      endpoint: normalizedEndpoint,
      action,
      status: finalStatus,
      ip: ip || null,
      user_agent: userAgent || null,
      bytes_in: inBytes,
      bytes_out: outBytes,
      files_processed: filesReceivedCount,
      error_code: finalStatus === 'success' ? null : safeErrorCode,
      error_message: finalStatus === 'success' ? null : safeErrorMessage,
      params_json: JSON.stringify(sanitizedParams),
    };

    try {
      const availableCols = await getRequestLogColumns();
      const cols = Object.keys(logRow).filter(col => availableCols.includes(col));
      if (!cols.length) return;

      const placeholders = cols.map(() => '?').join(', ');
      const values = cols.map(col => logRow[col]);
      const insertSql = `INSERT INTO request_log (${cols.join(', ')}) VALUES (${placeholders})`;

      if (safeRequestId) {
        const conn = await pool.getConnection();
        try {
          await conn.beginTransaction();
          try {
            await conn.execute(insertSql, values);
          } catch (insertErr) {
            if (insertErr && insertErr.code === 'ER_DUP_ENTRY') {
              await conn.rollback();
              return;
            }
            throw insertErr;
          }

          await conn.execute(updateSql, updateValues);
          await conn.commit();
        } catch (err) {
          try {
            await conn.rollback();
          } catch (rollbackErr) {
            logError('usage.recordUsageAndLog.rollback_failed', {
              message: rollbackErr.message,
              code: rollbackErr.code,
            });
          }
          throw err;
        } finally {
          conn.release();
        }
      } else {
        await pool.execute(updateSql, updateValues);
        await insertRequestLogRow(logRow);
      }
    } catch (err) {
      const availableCols = await getRequestLogColumns().catch(() => []);
      const colsUsed = Object.keys(logRow).filter(col => availableCols.includes(col));
      if (err && (err.code === 'ER_NO_SUCH_TABLE' || err.code === 'ER_BAD_FIELD_ERROR')) {
        logError('request_log.schema_missing', {
          message: 'request_log schema missing or incomplete; apply migrations or run schema ensure on startup.',
          code: err.code,
        });
      }
      logError('request_log.insert_failed', {
        message: err.message,
        code: err.code,
        cols: colsUsed,
        valuesLength: colsUsed.length,
      });
    }
  } catch (err) {
    logError('usage.recordUsageAndLog.failed', {
      api_key_id: apiKeyRecord?.id || null,
      endpoint,
      action,
      message: err.message,
      code: err.code,
      stack: err.stack,
    });
  }
}

module.exports = {
  getCurrentPeriod,
  getCalendarPeriodUTC,
  getValidityBoundsUTC,
  formatUTCDateYYYYMMDD,
  getCyclePeriodKey,
  getCyclePeriodKeyFromBounds,
  getUsagePeriodForKey,
  getOrCreateUsageForKey,
  checkMonthlyQuota,
  resolveQuotaPolicy,
  endpointUsageColumn,
  recordUsageAndLog,
  reserveQuota,
  finalizeQuota,
  refundQuota,
};
