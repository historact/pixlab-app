const { pool, query } = require('./db');
const {
  ensureRequestLogSchema,
  getRequestLogColumns,
  insertRequestLogRow,
} = require('./utils/requestLog');

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

function getCalendarPeriodUTC() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

function toIsoDate(input) {
  if (!input) return null;
  const normalized =
    input instanceof Date
      ? input
      : typeof input === 'string'
        ? new Date(`${input.replace(' ', 'T')}Z`)
        : new Date(input);
  const date = normalized instanceof Date ? normalized : new Date(normalized);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function getCyclePeriodKey(validFrom, validUntil) {
  const startIso = toIsoDate(validFrom);
  const endIso = toIsoDate(validUntil);
  if (!startIso || !endIso) return null;
  return `cycle:${startIso}_${endIso}`;
}

function getUsagePeriodForKey(keyRecord = {}, plan = null) {
  const planSlug = typeof plan?.plan_slug === 'string' ? plan.plan_slug.toLowerCase() : null;
  const isFreePlan = plan?.is_free === true || plan?.is_free === 1 || planSlug === 'free';
  if (isFreePlan) {
    return getCalendarPeriodUTC();
  }

  const cycleKey = getCyclePeriodKey(keyRecord.valid_from, keyRecord.valid_until);
  if (cycleKey) return cycleKey;

  return getCalendarPeriodUTC();
}

function getCurrentPeriod() {
  return getCalendarPeriodUTC();
}

async function getOrCreateUsageForKey(apiKeyId, period = getCalendarPeriodUTC(), monthlyQuota) {
  const rows = await query(
    `SELECT id, period, used_files, used_bytes, total_calls, total_files_processed,
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

  const [result] = await pool.execute(
    `INSERT INTO usage_monthly (
        api_key_id, period, used_files, used_bytes, total_calls, total_files_processed,
        h2i_calls, h2i_files, image_calls, image_files, pdf_calls, pdf_files,
        tools_calls, tools_files, bytes_in, bytes_out, errors, last_error_code,
        last_error_message, last_request_at, created_at, updated_at
      )
      VALUES (?, ?, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, NULL, NULL, NULL, NOW(), NOW())`,
    [apiKeyId, period]
  );

  return {
    id: result.insertId,
    period,
    used_files: 0,
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
}

function checkMonthlyQuota(usage, monthlyQuota, filesToConsume) {
  const limit = Number.isFinite(monthlyQuota) ? monthlyQuota : null;
  if (!limit) return { allowed: true, remaining: null };
  const remaining = limit - usage.used_files;
  return { allowed: remaining >= filesToConsume, remaining };
}

async function recordUsageAndLog({
  apiKeyRecord,
  endpoint,
  action,
  filesProcessed = 0,
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
}) {
  try {
    if (!apiKeyRecord || apiKeyRecord.status !== 'active') return;

    const endpointKey = (endpoint || '').toLowerCase();
    const normalizedEndpoint = endpoint || null;
    const filesCount = Number(filesProcessed) || 0;
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
    const updateValues = [filesCount, outBytes, filesCount, inBytes, outBytes];

    if (endpointKey.startsWith('/v1/h2i') || endpointKey === 'h2i') {
      updateFields.push('h2i_calls = h2i_calls + 1', 'h2i_files = h2i_files + ?');
      updateValues.push(filesCount);
    } else if (endpointKey.startsWith('/v1/image') || endpointKey === 'image') {
      updateFields.push('image_calls = image_calls + 1', 'image_files = image_files + ?');
      updateValues.push(filesCount);
    } else if (endpointKey.startsWith('/v1/pdf') || endpointKey === 'pdf') {
      updateFields.push('pdf_calls = pdf_calls + 1', 'pdf_files = pdf_files + ?');
      updateValues.push(filesCount);
    } else if (endpointKey.startsWith('/v1/tools') || endpointKey === 'tools') {
      updateFields.push('tools_calls = tools_calls + 1', 'tools_files = tools_files + ?');
      updateValues.push(filesCount);
    }

    if (finalStatus === 'error') {
      updateFields.push('errors = errors + 1', 'last_error_code = ?', 'last_error_message = ?');
      updateValues.push(safeErrorCode, safeErrorMessage);
    }

    updateValues.push(apiKeyRecord.id, period);

    const updateSql = `UPDATE usage_monthly SET ${updateFields.join(', ')} WHERE api_key_id = ? AND period = ?`;
    await pool.execute(updateSql, updateValues);

    const sanitizedParams = {};
    if (paramsForLog && typeof paramsForLog === 'object') {
      for (const [key, value] of Object.entries(paramsForLog)) {
        const lowerKey = key.toLowerCase();
        if (['api_key', 'key', 'license_key', 'bridge_token', 'token'].includes(lowerKey)) continue;
        sanitizedParams[key] = value;
      }
    }

    const logRow = {
      api_key_id: apiKeyRecord.id,
      timestamp: new Date(),
      endpoint: normalizedEndpoint,
      action,
      status: finalStatus,
      ip: ip || null,
      user_agent: userAgent || null,
      bytes_in: inBytes,
      bytes_out: outBytes,
      files_processed: filesCount,
      error_code: finalStatus === 'success' ? null : safeErrorCode,
      error_message: finalStatus === 'success' ? null : safeErrorMessage,
      params_json: JSON.stringify(sanitizedParams),
    };

    try {
      await ensureRequestLogSchema();
      await insertRequestLogRow(logRow);
    } catch (err) {
      const availableCols = await getRequestLogColumns().catch(() => []);
      const colsUsed = Object.keys(logRow).filter(col => availableCols.includes(col));
      console.error('REQUEST_LOG_INSERT_FAILED', {
        error: err.message,
        code: err.code,
        cols: colsUsed,
        valuesLength: colsUsed.length,
      });
    }
  } catch (err) {
    console.error('Failed to record usage/log:', err);
  }
}

module.exports = {
  getCurrentPeriod,
  getCalendarPeriodUTC,
  getCyclePeriodKey,
  getUsagePeriodForKey,
  getOrCreateUsageForKey,
  checkMonthlyQuota,
  recordUsageAndLog,
};
