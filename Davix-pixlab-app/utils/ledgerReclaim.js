const { pool } = require('../db');
const { logRuntime } = require('./logger');
const { getLedgerReclaimBatchSize } = require('./config');

const DEFAULT_INTERVAL_MS = 10 * 60 * 1000;
const DEFAULT_INITIAL_DELAY_MS = 30 * 1000;
const LOCK_NAME = 'pixlab_quota_ledger_reclaim';

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
    console.error('[DAVIX][ledger] failed to release reclaim lock', err);
    logRuntime('ledger_reclaim.lock_release_failed', { message: err.message }, 'error');
    return false;
  }
}

async function fetchExpiredReservations(conn, batchSize) {
  const [rows] = await conn.query(
    `SELECT id, api_key_id, period, reserve_units
       FROM quota_ledger
      WHERE status = 'reserved'
        AND expires_at IS NOT NULL
        AND expires_at < UTC_TIMESTAMP()
      ORDER BY id
      LIMIT ?`,
    [batchSize]
  );
  return rows;
}

async function markExpiredBatch(conn, ids) {
  if (!ids.length) return 0;
  const placeholders = ids.map(() => '?').join(',');
  const [result] = await conn.query(
    `UPDATE quota_ledger
        SET status = 'expired', updated_at = NOW()
      WHERE id IN (${placeholders})
        AND status = 'reserved'`,
    ids
  );
  return result?.affectedRows || 0;
}

async function releaseReservedUnits(conn, row) {
  const reserveUnits = Math.max(Number(row.reserve_units) || 0, 0);
  if (!reserveUnits) return 0;
  const [result] = await conn.query(
    `UPDATE usage_monthly
        SET reserved_files = GREATEST(reserved_files - ?, 0), updated_at = NOW()
      WHERE api_key_id = ? AND period = ?`,
    [reserveUnits, row.api_key_id, row.period]
  );
  return result?.affectedRows || 0;
}

async function runLedgerReclaimOnce({ batchSize = getLedgerReclaimBatchSize() } = {}) {
  const startedAt = Date.now();
  let conn;
  let lockAcquired = false;
  let expiredCount = 0;
  let releasedCount = 0;

  try {
    conn = await pool.getConnection();
    const gotLock = await acquireLock(conn);
    if (!gotLock) {
      console.warn('[DAVIX][ledger] reclaim skipped (lock busy)');
      logRuntime('ledger_reclaim.lock_busy', {}, 'warn');
      return { lockAcquired: false, expiredCount, releasedCount, durationMs: 0 };
    }

    lockAcquired = true;
    console.log('[DAVIX][ledger] reclaim acquired lock');
    logRuntime('ledger_reclaim.lock_acquired', {}, 'info');

    while (true) {
      const rows = await fetchExpiredReservations(conn, batchSize);
      if (!rows.length) break;

      const ids = rows.map(row => row.id);
      expiredCount += await markExpiredBatch(conn, ids);

      for (const row of rows) {
        releasedCount += await releaseReservedUnits(conn, row);
      }

      if (rows.length < batchSize) break;
    }

    const durationMs = Date.now() - startedAt;
    console.log(
      `[DAVIX][ledger] reclaim complete: expired=${expiredCount}, released=${releasedCount}, duration_ms=${durationMs}`
    );
    logRuntime('ledger_reclaim.complete', { expiredCount, releasedCount, durationMs }, 'info');
    return { lockAcquired: true, expiredCount, releasedCount, durationMs };
  } catch (err) {
    console.error('[DAVIX][ledger] reclaim error', err);
    logRuntime('ledger_reclaim.error', { message: err.message }, 'error');
    return {
      lockAcquired,
      expiredCount,
      releasedCount,
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

function startLedgerReclaim({
  enabled = true,
  intervalMs = DEFAULT_INTERVAL_MS,
  initialDelayMs = DEFAULT_INITIAL_DELAY_MS,
  batchSize = getLedgerReclaimBatchSize(),
} = {}) {
  if (!enabled || started) return intervalHandle || timeoutHandle;

  started = true;
  const runOnce = () => runLedgerReclaimOnce({ batchSize });

  timeoutHandle = setTimeout(() => {
    runOnce();
    intervalHandle = setInterval(runOnce, intervalMs);
  }, initialDelayMs);

  console.log(
    `[DAVIX][ledger] reclaim scheduled: interval_ms=${intervalMs}, batch_size=${batchSize}, initial_delay_ms=${initialDelayMs}`
  );

  return intervalHandle;
}

function stopLedgerReclaim() {
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
  runLedgerReclaimOnce,
  startLedgerReclaim,
  stopLedgerReclaim,
};
