const { pool, query } = require('./db');

function getCurrentPeriod() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function getOrCreateUsageForKey(apiKeyId, monthlyQuota) {
  const period = getCurrentPeriod();
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
  ok = true,
  errorCode = null,
  errorMessage = null,
  paramsForLog = null,
}) {
  try {
    if (!apiKeyRecord || apiKeyRecord.status !== 'active') return;

    const filesCount = Number(filesProcessed) || 0;
    const inBytes = Number(bytesIn) || 0;
    const outBytes = Number(bytesOut) || 0;

    const period = getCurrentPeriod();
    await getOrCreateUsageForKey(apiKeyRecord.id, apiKeyRecord.monthly_quota);

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

    if (endpoint && endpoint.startsWith('/v1/h2i')) {
      updateFields.push('h2i_calls = h2i_calls + 1', 'h2i_files = h2i_files + ?');
      updateValues.push(filesCount);
    } else if (endpoint && endpoint.startsWith('/v1/image')) {
      updateFields.push('image_calls = image_calls + 1', 'image_files = image_files + ?');
      updateValues.push(filesCount);
    } else if (endpoint && endpoint.startsWith('/v1/pdf')) {
      updateFields.push('pdf_calls = pdf_calls + 1', 'pdf_files = pdf_files + ?');
      updateValues.push(filesCount);
    } else if (endpoint && endpoint.startsWith('/v1/tools')) {
      updateFields.push('tools_calls = tools_calls + 1', 'tools_files = tools_files + ?');
      updateValues.push(filesCount);
    }

    if (!ok) {
      updateFields.push('errors = errors + 1', 'last_error_code = ?', 'last_error_message = ?');
      updateValues.push(errorCode || null, errorMessage || null);
    }

    updateValues.push(apiKeyRecord.id, period);

    const updateSql = `UPDATE usage_monthly SET ${updateFields.join(', ')} WHERE api_key_id = ? AND period = ?`;
    await pool.execute(updateSql, updateValues);

    const statusCode = ok ? 200 : 500;
    await pool.execute(
      `INSERT INTO request_log (
        timestamp, api_key_id, endpoint, action, status, error_code, files_processed,
        bytes_in, bytes_out, params_json
      ) VALUES (NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
      [
        apiKeyRecord.id,
        endpoint,
        action,
        statusCode,
        errorCode || null,
        filesCount,
        inBytes,
        outBytes,
        JSON.stringify(paramsForLog || {}),
      ]
    );
  } catch (err) {
    console.error('Failed to record usage/log:', err);
  }
}

module.exports = {
  getCurrentPeriod,
  getOrCreateUsageForKey,
  checkMonthlyQuota,
  recordUsageAndLog,
};
