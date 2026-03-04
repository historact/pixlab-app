const fs = require('fs');
const { pool } = require('../db');
const { logRuntime } = require('./logger');
const {
  getRateLimitsDailyCleanupEnabled,
  getRateLimitsDailyRetentionDays,
  getBurstLimitsWindowCleanupEnabled,
  getBurstLimitsWindowRetentionDays,
  parseBooleanEnv,
} = require('./config');
const { readSecondsAsMs, readMinutesAsMs, readHoursAsMs } = require('./envTime');

const LOCK_NAME = 'pixlab_retention_cleanup';
function parsePositiveIntEnv(name, fallback) {
  const parsed = Number.parseInt(process.env[name], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const DEFAULT_ENABLED = parseBooleanEnv('DB_RETENTION_CLEANUP_ENABLED', true);
const DEFAULT_LOG_PATH = process.env.DB_RETENTION_LOG_PATH || null;

const TABLE_CONFIG = {
  requestLog: {
    tableLabel: 'request_log',
    retentionValue: parsePositiveIntEnv('REQUEST_LOG_RETENTION_DAYS', 60),
    retentionUnit: 'DAY',
    intervalMs: readHoursAsMs('REQUEST_LOG_CLEANUP_INTERVAL_H', 24),
    initialDelayMs: readSecondsAsMs('REQUEST_LOG_CLEANUP_INITIAL_DELAY_S', 60),
    batchSize: parsePositiveIntEnv('REQUEST_LOG_CLEANUP_BATCH_SIZE', 20000),
  },
  usageMonthly: {
    tableLabel: 'usage_monthly',
    retentionValue: parsePositiveIntEnv('USAGE_MONTHLY_RETENTION_MONTHS', 6),
    retentionUnit: 'MONTH',
    intervalMs: readHoursAsMs('USAGE_MONTHLY_CLEANUP_INTERVAL_H', 24),
    initialDelayMs: readSecondsAsMs('USAGE_MONTHLY_CLEANUP_INITIAL_DELAY_S', 60),
    batchSize: parsePositiveIntEnv('USAGE_MONTHLY_CLEANUP_BATCH_SIZE', 5000),
  },
  rateLimitsDaily: {
    tableLabel: 'rate_limits_daily',
    enabled: getRateLimitsDailyCleanupEnabled(),
    retentionValue: getRateLimitsDailyRetentionDays(),
    intervalMs: readHoursAsMs('RATE_LIMITS_DAILY_CLEANUP_INTERVAL_H', 24),
    initialDelayMs: readSecondsAsMs('RATE_LIMITS_DAILY_CLEANUP_INITIAL_DELAY_S', 60),
    batchSize: parsePositiveIntEnv('RATE_LIMITS_DAILY_CLEANUP_BATCH_SIZE', 5000),
  },
  burstLimitsWindow: {
    tableLabel: 'burst_limits_window',
    enabled: getBurstLimitsWindowCleanupEnabled(),
    retentionValue: getBurstLimitsWindowRetentionDays(),
    intervalMs: readHoursAsMs('BURST_LIMITS_WINDOW_CLEANUP_INTERVAL_H', 24),
    initialDelayMs: readSecondsAsMs('BURST_LIMITS_WINDOW_CLEANUP_INITIAL_DELAY_S', 60),
    batchSize: parsePositiveIntEnv('BURST_LIMITS_WINDOW_CLEANUP_BATCH_SIZE', 5000),
  },
  internalRateLimitWindows: {
    tableLabel: 'internal_rate_limit_windows',
    retentionValue: parsePositiveIntEnv('INTERNAL_RATE_LIMIT_WINDOWS_RETENTION_DAYS', null, 1),
    intervalMs: readMinutesAsMs('INTERNAL_RATE_LIMIT_WINDOWS_CLEANUP_INTERVAL_MIN', 24 * 60),
    initialDelayMs: readSecondsAsMs('INTERNAL_RATE_LIMIT_WINDOWS_CLEANUP_INITIAL_DELAY_S', 60),
    batchSize: parsePositiveIntEnv('INTERNAL_RATE_LIMIT_WINDOWS_CLEANUP_BATCH_SIZE', 5000),
  },
  adminLoginLockouts: {
    tableLabel: 'admin_login_lockouts',
    retentionValue: parsePositiveIntEnv('ADMIN_LOGIN_LOCKOUTS_RETENTION_DAYS', null, 7),
    intervalMs: readHoursAsMs('ADMIN_LOGIN_LOCKOUTS_CLEANUP_INTERVAL_H', 24),
    initialDelayMs: readSecondsAsMs('ADMIN_LOGIN_LOCKOUTS_CLEANUP_INITIAL_DELAY_S', 60),
    batchSize: parsePositiveIntEnv('ADMIN_LOGIN_LOCKOUTS_CLEANUP_BATCH_SIZE', 5000),
  },
};

const scheduleState = Object.keys(TABLE_CONFIG).reduce((acc, key) => {
  acc[key] = { lastRunAt: 0 };
  return acc;
}, {});

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
    logRuntime('retention.lock_release_failed', { message: err.message }, 'error');
    return false;
  }
}

async function runRetentionCleanupOnce({ logPath = DEFAULT_LOG_PATH } = {}) {
  const startedAt = Date.now();
  let conn;
  let lockAcquired = false;
  const deleted = {
    requestLog: 0,
    usageMonthly: 0,
    rateLimitsDaily: 0,
    burstLimitsWindow: 0,
    internalRateLimitWindows: 0,
    adminLoginLockouts: 0,
  };

  try {
    conn = await pool.getConnection();
    const gotLock = await acquireLock(conn);
    if (!gotLock) return { lockAcquired: false, deleted, durationMs: 0 };

    lockAcquired = true;
    const now = Date.now();

    while (true) {
      let removedAny = false;

      if (now - scheduleState.requestLog.lastRunAt >= TABLE_CONFIG.requestLog.intervalMs) {
        const [result] = await conn.query(
          'DELETE FROM request_log WHERE created_at < (UTC_TIMESTAMP() - INTERVAL ? DAY) LIMIT ?',
          [TABLE_CONFIG.requestLog.retentionValue, TABLE_CONFIG.requestLog.batchSize]
        );
        const removed = result?.affectedRows || 0;
        deleted.requestLog += removed;
        removedAny = removedAny || removed > 0;
        if (removed < TABLE_CONFIG.requestLog.batchSize) scheduleState.requestLog.lastRunAt = now;
      }

      if (now - scheduleState.usageMonthly.lastRunAt >= TABLE_CONFIG.usageMonthly.intervalMs) {
        const [result] = await conn.query(
          'DELETE FROM usage_monthly WHERE created_at < (UTC_TIMESTAMP() - INTERVAL ? MONTH) LIMIT ?',
          [TABLE_CONFIG.usageMonthly.retentionValue, TABLE_CONFIG.usageMonthly.batchSize]
        );
        const removed = result?.affectedRows || 0;
        deleted.usageMonthly += removed;
        removedAny = removedAny || removed > 0;
        if (removed < TABLE_CONFIG.usageMonthly.batchSize) scheduleState.usageMonthly.lastRunAt = now;
      }

      if (TABLE_CONFIG.rateLimitsDaily.enabled && now - scheduleState.rateLimitsDaily.lastRunAt >= TABLE_CONFIG.rateLimitsDaily.intervalMs) {
        const [result] = await conn.query(
          'DELETE FROM rate_limits_daily WHERE day_utc < (UTC_DATE() - INTERVAL ? DAY) LIMIT ?',
          [TABLE_CONFIG.rateLimitsDaily.retentionValue, TABLE_CONFIG.rateLimitsDaily.batchSize]
        );
        const removed = result?.affectedRows || 0;
        deleted.rateLimitsDaily += removed;
        removedAny = removedAny || removed > 0;
        if (removed < TABLE_CONFIG.rateLimitsDaily.batchSize) scheduleState.rateLimitsDaily.lastRunAt = now;
      }

      if (TABLE_CONFIG.burstLimitsWindow.enabled && now - scheduleState.burstLimitsWindow.lastRunAt >= TABLE_CONFIG.burstLimitsWindow.intervalMs) {
        const [result] = await conn.query(
          'DELETE FROM burst_limits_window WHERE window_start < (UTC_TIMESTAMP() - INTERVAL ? DAY) LIMIT ?',
          [TABLE_CONFIG.burstLimitsWindow.retentionValue, TABLE_CONFIG.burstLimitsWindow.batchSize]
        );
        const removed = result?.affectedRows || 0;
        deleted.burstLimitsWindow += removed;
        removedAny = removedAny || removed > 0;
        if (removed < TABLE_CONFIG.burstLimitsWindow.batchSize) scheduleState.burstLimitsWindow.lastRunAt = now;
      }

      if (now - scheduleState.internalRateLimitWindows.lastRunAt >= TABLE_CONFIG.internalRateLimitWindows.intervalMs) {
        const [result] = await conn.query(
          'DELETE FROM internal_rate_limit_windows WHERE window_start < (UTC_TIMESTAMP() - INTERVAL ? DAY) LIMIT ?',
          [TABLE_CONFIG.internalRateLimitWindows.retentionValue, TABLE_CONFIG.internalRateLimitWindows.batchSize]
        );
        const removed = result?.affectedRows || 0;
        deleted.internalRateLimitWindows += removed;
        removedAny = removedAny || removed > 0;
        if (removed < TABLE_CONFIG.internalRateLimitWindows.batchSize) {
          scheduleState.internalRateLimitWindows.lastRunAt = now;
        }
      }

      if (now - scheduleState.adminLoginLockouts.lastRunAt >= TABLE_CONFIG.adminLoginLockouts.intervalMs) {
        const [result] = await conn.query(
          `DELETE FROM admin_login_lockouts
            WHERE (lock_until IS NOT NULL AND lock_until < UTC_TIMESTAMP())
               OR updated_at < (UTC_TIMESTAMP() - INTERVAL ? DAY)
            LIMIT ?`,
          [TABLE_CONFIG.adminLoginLockouts.retentionValue, TABLE_CONFIG.adminLoginLockouts.batchSize]
        );
        const removed = result?.affectedRows || 0;
        deleted.adminLoginLockouts += removed;
        removedAny = removedAny || removed > 0;
        if (removed < TABLE_CONFIG.adminLoginLockouts.batchSize) scheduleState.adminLoginLockouts.lastRunAt = now;
      }

      if (!removedAny) break;
    }

    const durationMs = Date.now() - startedAt;
    const summary = `[DAVIX][retention] cleanup complete: request_log=${deleted.requestLog}, usage_monthly=${deleted.usageMonthly}, rate_limits_daily=${deleted.rateLimitsDaily}, burst_limits_window=${deleted.burstLimitsWindow}, internal_rate_limit_windows=${deleted.internalRateLimitWindows}, admin_login_lockouts=${deleted.adminLoginLockouts}, duration_ms=${durationMs}`;
    if (logPath) fs.appendFileSync(logPath, `${new Date().toISOString()} ${summary}\n`);
    logRuntime('retention.cleanup_complete', { summary }, 'info');
    return { lockAcquired: true, ...deleted, durationMs };
  } catch (err) {
    logRuntime('retention.cleanup_error', { message: err.message }, 'error');
    return { lockAcquired, ...deleted, durationMs: Date.now() - startedAt, error: err };
  } finally {
    if (lockAcquired && conn) await releaseLock(conn);
    if (conn) conn.release();
  }
}

function startRetentionCleanup({ enabled = DEFAULT_ENABLED, tickIntervalMs = 60 * 1000, logPath = DEFAULT_LOG_PATH } = {}) {
  if (!enabled || started) return intervalHandle || timeoutHandle;
  started = true;
  const earliestInitialDelay = Math.min(...Object.values(TABLE_CONFIG).map(cfg => cfg.initialDelayMs));
  const runOnce = () => runRetentionCleanupOnce({ logPath });
  timeoutHandle = setTimeout(() => {
    runOnce();
    intervalHandle = setInterval(runOnce, tickIntervalMs);
  }, earliestInitialDelay);
  return intervalHandle;
}

function stopRetentionCleanup() {
  if (timeoutHandle) clearTimeout(timeoutHandle);
  if (intervalHandle) clearInterval(intervalHandle);
  timeoutHandle = null;
  intervalHandle = null;
  started = false;
}

module.exports = { runRetentionCleanupOnce, startRetentionCleanup, stopRetentionCleanup };
