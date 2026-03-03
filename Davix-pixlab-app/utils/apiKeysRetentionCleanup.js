const { pool } = require('../db');
const { logRuntime } = require('./logger');

const LOCK_NAME = 'pixlab_api_keys_retention_cleanup';

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
    logRuntime('api_keys_retention.lock_release_failed', { message: err.message }, 'error');
    return false;
  }
}

async function deleteExpiredKeysBatch(conn, { retentionDays, batchSize }) {
  const [result] = await conn.query(
    `DELETE FROM api_keys
      WHERE subscription_status = ?
        AND status = ?
        AND valid_until IS NOT NULL
        AND valid_until < (UTC_TIMESTAMP() - INTERVAL ? DAY)
      ORDER BY id
      LIMIT ?`,
    ['expired', 'disabled', retentionDays, batchSize]
  );
  return result?.affectedRows || 0;
}

async function runApiKeysRetentionCleanupOnce({ retentionDays = 180, batchSize = 5000 } = {}) {
  const startedAt = Date.now();
  let conn;
  let lockAcquired = false;
  let totalDeleted = 0;
  try {
    conn = await pool.getConnection();
    const gotLock = await acquireLock(conn);
    if (!gotLock) return { lockAcquired: false, totalDeleted: 0, durationMs: 0 };
    lockAcquired = true;

    while (true) {
      const deleted = await deleteExpiredKeysBatch(conn, { retentionDays, batchSize });
      totalDeleted += deleted;
      if (deleted < batchSize) break;
    }

    const durationMs = Date.now() - startedAt;
    logRuntime('api_keys_retention.cleanup_complete', { totalDeleted, retentionDays, durationMs }, 'info');
    return { lockAcquired: true, totalDeleted, durationMs };
  } catch (err) {
    logRuntime('api_keys_retention.cleanup_failed', { message: err.message, retentionDays }, 'error');
    return { lockAcquired, totalDeleted, durationMs: Date.now() - startedAt, error: err };
  } finally {
    if (lockAcquired && conn) await releaseLock(conn);
    if (conn) conn.release();
  }
}

function startApiKeysRetentionCleanup({ intervalMs, initialDelayMs, retentionDays, batchSize } = {}) {
  if (started) return intervalHandle || timeoutHandle;
  started = true;

  const runOnce = () => runApiKeysRetentionCleanupOnce({ retentionDays, batchSize });
  timeoutHandle = setTimeout(() => {
    runOnce();
    intervalHandle = setInterval(runOnce, intervalMs);
  }, initialDelayMs);
  return intervalHandle;
}

function stopApiKeysRetentionCleanup() {
  if (timeoutHandle) clearTimeout(timeoutHandle);
  if (intervalHandle) clearInterval(intervalHandle);
  timeoutHandle = null;
  intervalHandle = null;
  started = false;
}

module.exports = {
  runApiKeysRetentionCleanupOnce,
  startApiKeysRetentionCleanup,
  stopApiKeysRetentionCleanup,
};
