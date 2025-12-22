const { pool } = require('../db');

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

async function runExpiryWatcherOnce({ batchSize = DEFAULT_BATCH_SIZE } = {}) {
  const startedAt = Date.now();
  let conn;
  let lockAcquired = false;
  let totalDeleted = 0;

  try {
    conn = await pool.getConnection();
    const gotLock = await acquireLock(conn, LOCK_NAME);
    if (!gotLock) {
      console.warn('Expiry watcher skipped (lock busy)');
      return { lockAcquired: false, totalDeleted: 0, durationMs: 0 };
    }

    lockAcquired = true;
    console.log('Expiry watcher acquired lock');

    while (true) {
      const deleted = await deleteExpiredDisabledKeysBatch(conn, batchSize);
      totalDeleted += deleted;
      if (deleted < batchSize) break;
    }

    const durationMs = Date.now() - startedAt;
    console.log(`Expiry watcher run complete: deleted=${totalDeleted}, duration_ms=${durationMs}`);
    return { lockAcquired: true, totalDeleted, durationMs };
  } catch (err) {
    console.error('Expiry watcher error', err);
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
