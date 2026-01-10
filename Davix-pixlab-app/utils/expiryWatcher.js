const { pool } = require('../db');
const { logRuntime } = require('./logger');

const DEFAULT_BATCH_SIZE = 500;
const DEFAULT_INTERVAL_MS = 10 * 60 * 1000;
const DEFAULT_INITIAL_DELAY_MS = 30 * 1000;
const LOCK_NAME = 'pixlab_api_keys_expiry';

let intervalHandle = null;
let timeoutHandle = null;
let started = false;

async function acquireLock(conn, lockName) {
  const [rows] = await conn.query('SELECT GET_LOCK(?, 0) AS got', [lockName]);
  return rows?.[0]?.got === 1;
}

async function releaseLock(conn, lockName) {
  try {
    const [rows] = await conn.query('SELECT RELEASE_LOCK(?) AS released', [lockName]);
    return rows?.[0]?.released === 1;
  } catch (err) {
    console.error('Expiry watcher failed to release lock', err);
    logRuntime('expiry_watcher.lock_release_failed', { message: err.message }, 'error');
    return false;
  }
}

async function deleteExpiredDisabledKeysBatch(conn, batchSize = DEFAULT_BATCH_SIZE) {
  const [result] = await conn.query(
    `DELETE FROM api_keys
      WHERE subscription_status = ?
        AND status = ?
      ORDER BY id
      LIMIT ?`,
    ['expired', 'disabled', batchSize]
  );

  return result?.affectedRows || 0;
}

async function normalizeExpiredActiveKeysBatch(conn, batchSize = DEFAULT_BATCH_SIZE) {
  const [result] = await conn.query(
    `UPDATE api_keys
        SET status = ?, subscription_status = ?, updated_at = NOW()
      WHERE status = ?
        AND valid_until IS NOT NULL
        AND valid_until < NOW()
      ORDER BY id
      LIMIT ?`,
    ['disabled', 'expired', 'active', batchSize]
  );

  return result?.affectedRows || 0;
}

async function runExpiryWatcherOnce({ batchSize = DEFAULT_BATCH_SIZE } = {}) {
  const startedAt = Date.now();
  let conn;
  let lockAcquired = false;
  let totalDeleted = 0;
  let totalNormalized = 0;

  try {
    conn = await pool.getConnection();
    const gotLock = await acquireLock(conn, LOCK_NAME);
    if (!gotLock) {
      console.warn('Expiry watcher skipped (lock busy)');
      logRuntime('expiry_watcher.lock_busy', {}, 'warn');
      return { lockAcquired: false, totalDeleted: 0, durationMs: 0 };
    }

    lockAcquired = true;
    console.log('Expiry watcher acquired lock');
    logRuntime('expiry_watcher.lock_acquired', {}, 'info');

    while (true) {
      const normalized = await normalizeExpiredActiveKeysBatch(conn, batchSize);
      totalNormalized += normalized;
      if (normalized < batchSize) break;
    }

    while (true) {
      const deleted = await deleteExpiredDisabledKeysBatch(conn, batchSize);
      totalDeleted += deleted;
      if (deleted < batchSize) break;
    }

    const durationMs = Date.now() - startedAt;
    console.log(`Expiry watcher run complete: normalized=${totalNormalized}, deleted=${totalDeleted}, duration_ms=${durationMs}`);
    logRuntime('expiry_watcher.complete', { totalNormalized, totalDeleted, durationMs }, 'info');
    return { lockAcquired: true, totalDeleted, durationMs };
  } catch (err) {
    console.error('Expiry watcher error', err);
    logRuntime('expiry_watcher.error', { message: err.message }, 'error');
    return { lockAcquired, totalDeleted, durationMs: Date.now() - startedAt, error: err };
  } finally {
    if (lockAcquired && conn) {
      await releaseLock(conn, LOCK_NAME);
    }
    if (conn) conn.release();
  }
}

function startExpiryWatcher({
  intervalMs = DEFAULT_INTERVAL_MS,
  initialDelayMs = DEFAULT_INITIAL_DELAY_MS,
  batchSize = DEFAULT_BATCH_SIZE,
} = {}) {
  if (started) return intervalHandle || timeoutHandle;

  started = true;
  const runOnce = () => runExpiryWatcherOnce({ batchSize });

  timeoutHandle = setTimeout(() => {
    runOnce();
    intervalHandle = setInterval(runOnce, intervalMs);
  }, initialDelayMs);

  console.log(
    `Expiry watcher scheduled: interval_ms=${intervalMs}, batch_size=${batchSize}, initial_delay_ms=${initialDelayMs}`
  );

  return intervalHandle;
}

function stopExpiryWatcher() {
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
  acquireLock,
  releaseLock,
  deleteExpiredDisabledKeysBatch,
  runExpiryWatcherOnce,
  startExpiryWatcher,
  stopExpiryWatcher,
};
