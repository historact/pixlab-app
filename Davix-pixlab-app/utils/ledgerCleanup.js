const { pool } = require('../db');
const { logRuntime } = require('./logger');
const { getLedgerCleanupBatchSize, getLedgerRetentionDays } = require('./config');

const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_INITIAL_DELAY_MS = 60 * 1000;
const LOCK_NAME = 'pixlab_quota_ledger_cleanup';

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
    console.error('[DAVIX][ledger] failed to release cleanup lock', err);
    logRuntime('ledger_cleanup.lock_release_failed', { message: err.message }, 'error');
    return false;
  }
}

async function deleteOldLedgerRows(conn, retentionDays, batchSize) {
  const [result] = await conn.query(
    `DELETE FROM quota_ledger
      WHERE created_at < (UTC_TIMESTAMP() - INTERVAL ? DAY)
      LIMIT ?`,
    [retentionDays, batchSize]
  );
  return result?.affectedRows || 0;
}

async function runLedgerCleanupOnce({
  retentionDays = getLedgerRetentionDays(),
  batchSize = getLedgerCleanupBatchSize(),
} = {}) {
  const startedAt = Date.now();
  let conn;
  let lockAcquired = false;
  let deletedCount = 0;

  try {
    conn = await pool.getConnection();
    const gotLock = await acquireLock(conn);
    if (!gotLock) {
      console.warn('[DAVIX][ledger] cleanup skipped (lock busy)');
      logRuntime('ledger_cleanup.lock_busy', {}, 'warn');
      return { lockAcquired: false, deletedCount, durationMs: 0 };
    }

    lockAcquired = true;
    console.log('[DAVIX][ledger] cleanup acquired lock');
    logRuntime('ledger_cleanup.lock_acquired', {}, 'info');

    while (true) {
      const removed = await deleteOldLedgerRows(conn, retentionDays, batchSize);
      deletedCount += removed;
      if (!removed) break;
      if (removed < batchSize) break;
    }

    const durationMs = Date.now() - startedAt;
    console.log(`[DAVIX][ledger] cleanup complete: deleted=${deletedCount}, duration_ms=${durationMs}`);
    logRuntime('ledger_cleanup.complete', { deletedCount, durationMs }, 'info');
    return { lockAcquired: true, deletedCount, durationMs };
  } catch (err) {
    console.error('[DAVIX][ledger] cleanup error', err);
    logRuntime('ledger_cleanup.error', { message: err.message }, 'error');
    return { lockAcquired, deletedCount, durationMs: Date.now() - startedAt, error: err };
  } finally {
    if (lockAcquired && conn) {
      await releaseLock(conn);
    }
    if (conn) conn.release();
  }
}

function startLedgerCleanup({
  enabled = true,
  intervalMs = DEFAULT_INTERVAL_MS,
  initialDelayMs = DEFAULT_INITIAL_DELAY_MS,
  retentionDays = getLedgerRetentionDays(),
  batchSize = getLedgerCleanupBatchSize(),
} = {}) {
  if (!enabled || started) return intervalHandle || timeoutHandle;

  started = true;
  const runOnce = () => runLedgerCleanupOnce({ retentionDays, batchSize });

  timeoutHandle = setTimeout(() => {
    runOnce();
    intervalHandle = setInterval(runOnce, intervalMs);
  }, initialDelayMs);

  console.log(
    `[DAVIX][ledger] cleanup scheduled: interval_ms=${intervalMs}, retention_days=${retentionDays}, batch_size=${batchSize}, initial_delay_ms=${initialDelayMs}`
  );

  return intervalHandle;
}

function stopLedgerCleanup() {
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
  runLedgerCleanupOnce,
  startLedgerCleanup,
  stopLedgerCleanup,
};
