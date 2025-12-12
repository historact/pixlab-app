const { pool, query } = require('./db');

function getCurrentPeriod() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function getOrCreateUsageForKey(apiKeyId, monthlyQuota) {
  const period = getCurrentPeriod();
  const rows = await query(
    'SELECT id, period, used_files, used_bytes FROM usage_monthly WHERE api_key_id = ? AND period = ? LIMIT 1',
    [apiKeyId, period]
  );

  if (rows.length) {
    return { ...rows[0], limit: monthlyQuota };
  }

  const [result] = await pool.execute(
    'INSERT INTO usage_monthly (api_key_id, period, used_files, used_bytes, created_at, updated_at) VALUES (?, ?, 0, 0, NOW(), NOW())',
    [apiKeyId, period]
  );

  return { id: result.insertId, period, used_files: 0, used_bytes: 0, limit: monthlyQuota };
}

function checkMonthlyQuota(usage, monthlyQuota, filesToConsume) {
  const limit = Number.isFinite(monthlyQuota) ? monthlyQuota : null;
  if (!limit) return { allowed: true, remaining: null };
  const remaining = limit - usage.used_files;
  return { allowed: remaining >= filesToConsume, remaining };
}

async function recordUsageAndLog({
  apiKeyId,
  period,
  filesProcessed,
  bytesIn = 0,
  bytesOut = 0,
  endpoint,
  action,
  status,
  errorCode = null,
  errorMessage = null,
  paramsSummary = null,
  ipAddress = null,
  userAgent = null,
}) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    if (filesProcessed > 0) {
      await conn.execute(
        'UPDATE usage_monthly SET used_files = used_files + ?, used_bytes = used_bytes + ?, updated_at = NOW() WHERE api_key_id = ? AND period = ?',
        [filesProcessed, bytesOut || 0, apiKeyId, period]
      );
    } else {
      await conn.execute('UPDATE usage_monthly SET updated_at = NOW() WHERE api_key_id = ? AND period = ?', [apiKeyId, period]);
    }

    await conn.execute(
      'INSERT INTO request_log (api_key_id, timestamp, endpoint, action, status, error_code, error_message, files_processed, bytes_in, bytes_out, params_json, ip_address, user_agent) VALUES (?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        apiKeyId,
        endpoint,
        action,
        status,
        errorCode,
        errorMessage,
        filesProcessed,
        bytesIn,
        bytesOut,
        paramsSummary ? JSON.stringify(paramsSummary).slice(0, 2000) : null,
        ipAddress,
        userAgent,
      ]
    );

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    console.error('Failed to record usage/log:', err);
  } finally {
    conn.release();
  }
}

module.exports = {
  getCurrentPeriod,
  getOrCreateUsageForKey,
  checkMonthlyQuota,
  recordUsageAndLog,
};
