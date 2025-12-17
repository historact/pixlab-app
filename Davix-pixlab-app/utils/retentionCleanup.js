const fs = require('fs');
const { pool } = require('../db');

const DEFAULT_ENABLED = process.env.RETENTION_CLEANUP_ENABLED !== 'false';
const DEFAULT_INTERVAL_MS = parseInt(process.env.RETENTION_CLEANUP_INTERVAL_MS, 10) || 24 * 60 * 60 * 1000;
const DEFAULT_INITIAL_DELAY_MS = parseInt(process.env.RETENTION_INITIAL_DELAY_MS, 10) || 60 * 1000;
const DEFAULT_REQUEST_LOG_DAYS = parseInt(process.env.RETENTION_REQUEST_LOG_DAYS, 10) || 60;
const DEFAULT_USAGE_MONTHS = parseInt(process.env.RETENTION_USAGE_MONTHLY_MONTHS, 10) || 6;
const DEFAULT_BATCH_REQUEST_LOG = parseInt(process.env.RETENTION_BATCH_REQUEST_LOG, 10) || 20000;
const DEFAULT_BATCH_USAGE_MONTHLY = parseInt(process.env.RETENTION_BATCH_USAGE_MONTHLY, 10) || 5000;
const DEFAULT_LOG_PATH = process.env.RETENTION_LOG_PATH || null;
const LOCK_NAME = 'pixlab_retention_cleanup';

let intervalHandle = null;
let timeoutHandle = null;
let started = false;

async function acquireLock(conn) {
  const [rows] = await conn.query('SELECT GET_LOCK(?, 0) AS got', [LOCK_NAME]);
  return rows?.[0]?.got === 1;
}

async function releaseLock(conn) {
  try {
    const [rows] = await conn.query('SELECT RELEASE_LOCK(?) AS released', [LOCK_NAME]);
    return rows?.[0]?.released === 1;
  } catch (err) {
    console.error('[DAVIX][retention] failed to release lock', err);
    return false;
  }
}

async function deleteOldRequestLogs(conn, days, batchSize) {
  const [result] = await conn.query(
    `DELETE FROM request_log WHERE created_at < (UTC_TIMESTAMP() - INTERVAL ? DAY) LIMIT ?`,
    [days, batchSize]
  );
  return result?.affectedRows || 0;
}

async function deleteOldUsage(conn, months, batchSize) {
  const [result] = await conn.query(
    `DELETE FROM usage_monthly WHERE created_at < (UTC_TIMESTAMP() - INTERVAL ? MONTH) LIMIT ?`,
    [months, batchSize]
  );
  return result?.affectedRows || 0;
}

function writeLog(message, logPath = DEFAULT_LOG_PATH) {
  if (!logPath) return;
  try {
    fs.appendFileSync(logPath, `${new Date().toISOString()} ${message}\n`);
  } catch (err) {
    console.error('[DAVIX][retention] failed to write log', err);
  }
}

async function runRetentionCleanupOnce({
  requestLogDays = DEFAULT_REQUEST_LOG_DAYS,
  usageMonthlyMonths = DEFAULT_USAGE_MONTHS,
  batchRequestLog = DEFAULT_BATCH_REQUEST_LOG,
  batchUsageMonthly = DEFAULT_BATCH_USAGE_MONTHLY,
  logPath = DEFAULT_LOG_PATH,
} = {}) {
  const startedAt = Date.now();
  let conn;
  let lockAcquired = false;
  let deletedRequestLog = 0;
  let deletedUsageMonthly = 0;

  try {
    conn = await pool.getConnection();
    const gotLock = await acquireLock(conn);
    if (!gotLock) {
      console.warn('[DAVIX][retention] cleanup skipped (lock busy)');
      return { lockAcquired: false, deletedRequestLog, deletedUsageMonthly, durationMs: 0 };
    }

    lockAcquired = true;
    console.log('[DAVIX][retention] cleanup acquired lock');

    while (true) {
      const removedLogs = await deleteOldRequestLogs(conn, requestLogDays, batchRequestLog);
      const removedUsage = await deleteOldUsage(conn, usageMonthlyMonths, batchUsageMonthly);

      deletedRequestLog += removedLogs;
      deletedUsageMonthly += removedUsage;

      if (!removedLogs && !removedUsage) break;
    }

    const durationMs = Date.now() - startedAt;
    const summary = `[DAVIX][retention] cleanup complete: request_log=${deletedRequestLog}, usage_monthly=${deletedUsageMonthly}, duration_ms=${durationMs}`;
    console.log(summary);
    writeLog(summary, logPath);
    return { lockAcquired: true, deletedRequestLog, deletedUsageMonthly, durationMs };
  } catch (err) {
    console.error('[DAVIX][retention] cleanup error', err);
    return {
      lockAcquired,
      deletedRequestLog,
      deletedUsageMonthly,
      durationMs: Date.now() - startedAt,
      error: err,
    };
  } finally {
    if (lockAcquired && conn) {
      await releaseLock(conn);
    }
    if (conn) conn.release();
  }
}

function startRetentionCleanup({
  enabled = DEFAULT_ENABLED,
  intervalMs = DEFAULT_INTERVAL_MS,
  initialDelayMs = DEFAULT_INITIAL_DELAY_MS,
  requestLogDays = DEFAULT_REQUEST_LOG_DAYS,
  usageMonthlyMonths = DEFAULT_USAGE_MONTHS,
  batchRequestLog = DEFAULT_BATCH_REQUEST_LOG,
  batchUsageMonthly = DEFAULT_BATCH_USAGE_MONTHLY,
  logPath = DEFAULT_LOG_PATH,
} = {}) {
  if (!enabled || started) return intervalHandle || timeoutHandle;

  started = true;
  const runOnce = () =>
    runRetentionCleanupOnce({ requestLogDays, usageMonthlyMonths, batchRequestLog, batchUsageMonthly, logPath });

  timeoutHandle = setTimeout(() => {
    runOnce();
    intervalHandle = setInterval(runOnce, intervalMs);
  }, initialDelayMs);

  console.log(
    `[DAVIX][retention] cleanup scheduled: interval_ms=${intervalMs}, request_log_days=${requestLogDays}, usage_months=${usageMonthlyMonths}, batch_request_log=${batchRequestLog}, batch_usage_monthly=${batchUsageMonthly}, initial_delay_ms=${initialDelayMs}`
  );

  return intervalHandle;
}

function stopRetentionCleanup() {
  if (timeoutHandle) {
    clearTimeout(timeoutHandle);
    timeoutHandle = null;
  }
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  started = false;
}

module.exports = {
  runRetentionCleanupOnce,
  startRetentionCleanup,
  stopRetentionCleanup,
};
