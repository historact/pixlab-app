const { pool } = require('../db');

const DEFAULT_INTERVAL_MS = parseInt(process.env.ORPHAN_CLEANUP_INTERVAL_MS, 10) || 24 * 60 * 60 * 1000;
const DEFAULT_INITIAL_DELAY_MS = parseInt(process.env.ORPHAN_CLEANUP_INITIAL_DELAY_MS, 10) || 5 * 60 * 1000;
const DEFAULT_BATCH_SIZE = parseInt(process.env.ORPHAN_CLEANUP_BATCH, 10) || 5000;
const LOCK_NAME = 'pixlab_orphan_cleanup';

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
    console.error('[DAVIX][cleanup] failed to release lock', err);
    return false;
  }
}

async function deleteOrphans(conn, table, batchSize) {
  let rows = [];
  try {
    [rows] = await conn.query(
      `SELECT t.id
         FROM ${table} t
         LEFT JOIN api_keys ak ON t.api_key_id = ak.id
        WHERE ak.id IS NULL
        LIMIT ?`,
      [batchSize]
    );
  } catch (err) {
    console.error(`[DAVIX][cleanup] failed to scan ${table} for orphans`, err);
    return 0;
  }

  const ids = rows.map(row => row.id);
  if (!ids.length) return 0;

  const placeholders = ids.map(() => '?').join(',');
  const [result] = await conn.query(`DELETE FROM ${table} WHERE id IN (${placeholders})`, ids);
  return result?.affectedRows || 0;
}

async function runOrphanCleanupOnce({ batchSize = DEFAULT_BATCH_SIZE } = {}) {
  const startedAt = Date.now();
  let conn;
  let lockAcquired = false;
  let deletedLogs = 0;
  let deletedUsage = 0;

  try {
    conn = await pool.getConnection();
    const gotLock = await acquireLock(conn);
    if (!gotLock) {
      console.warn('[DAVIX][cleanup] orphan cleanup skipped (lock busy)');
      return { lockAcquired: false, deletedLogs, deletedUsage, durationMs: 0 };
    }

    lockAcquired = true;
    console.log('[DAVIX][cleanup] orphan cleanup acquired lock');

    while (true) {
      const removedLogs = await deleteOrphans(conn, 'request_log', batchSize);
      const removedUsage = await deleteOrphans(conn, 'usage_monthly', batchSize);

      deletedLogs += removedLogs;
      deletedUsage += removedUsage;

      if (!removedLogs && !removedUsage) break;
    }

    const durationMs = Date.now() - startedAt;
    console.log(
      `[DAVIX][cleanup] orphan cleanup complete: request_log=${deletedLogs}, usage_monthly=${deletedUsage}, duration_ms=${durationMs}`
    );
    return { lockAcquired: true, deletedLogs, deletedUsage, durationMs };
  } catch (err) {
    console.error('[DAVIX][cleanup] orphan cleanup error', err);
    return { lockAcquired, deletedLogs, deletedUsage, durationMs: Date.now() - startedAt, error: err };
  } finally {
    if (lockAcquired && conn) {
      await releaseLock(conn);
    }
    if (conn) conn.release();
  }
}

function startOrphanCleanup({
  intervalMs = DEFAULT_INTERVAL_MS,
  initialDelayMs = DEFAULT_INITIAL_DELAY_MS,
  batchSize = DEFAULT_BATCH_SIZE,
} = {}) {
  if (started) return intervalHandle || timeoutHandle;

  started = true;
  const runOnce = () => runOrphanCleanupOnce({ batchSize });

  timeoutHandle = setTimeout(() => {
    runOnce();
    intervalHandle = setInterval(runOnce, intervalMs);
  }, initialDelayMs);

  console.log(
    `[DAVIX][cleanup] orphan cleanup scheduled: interval_ms=${intervalMs}, batch_size=${batchSize}, initial_delay_ms=${initialDelayMs}`
  );

  return intervalHandle;
}

function stopOrphanCleanup() {
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
  runOrphanCleanupOnce,
  startOrphanCleanup,
  stopOrphanCleanup,
};
