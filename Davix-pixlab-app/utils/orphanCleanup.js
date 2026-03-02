const { pool } = require('../db');
const { logRuntime } = require('./logger');

const LOCK_NAME = 'pixlab_orphan_cleanup';
function parsePositiveIntEnv(name, fallback) {
  const parsed = Number.parseInt(process.env[name], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const DEFAULT_ENABLED = process.env.DB_ORPHAN_CLEANUP_ENABLED !== 'false';
const REQUEST_LOG_ORPHAN_CLEANUP_INTERVAL_MS = parsePositiveIntEnv(
  'REQUEST_LOG_ORPHAN_CLEANUP_INTERVAL_MS',
  24 * 60 * 60 * 1000
);
const REQUEST_LOG_ORPHAN_CLEANUP_BATCH_SIZE = parsePositiveIntEnv(
  'REQUEST_LOG_ORPHAN_CLEANUP_BATCH_SIZE',
  5000
);
const REQUEST_LOG_ORPHAN_CLEANUP_INITIAL_DELAY_MS = parsePositiveIntEnv(
  'REQUEST_LOG_ORPHAN_CLEANUP_INITIAL_DELAY_MS',
  5 * 60 * 1000
);

const USAGE_MONTHLY_ORPHAN_CLEANUP_INTERVAL_MS = parsePositiveIntEnv(
  'USAGE_MONTHLY_ORPHAN_CLEANUP_INTERVAL_MS',
  24 * 60 * 60 * 1000
);
const USAGE_MONTHLY_ORPHAN_CLEANUP_BATCH_SIZE = parsePositiveIntEnv(
  'USAGE_MONTHLY_ORPHAN_CLEANUP_BATCH_SIZE',
  5000
);
const USAGE_MONTHLY_ORPHAN_CLEANUP_INITIAL_DELAY_MS = parsePositiveIntEnv(
  'USAGE_MONTHLY_ORPHAN_CLEANUP_INITIAL_DELAY_MS',
  5 * 60 * 1000
);

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
    logRuntime('orphan_cleanup.lock_release_failed', { message: err.message }, 'error');
    return false;
  }
}

async function deleteOrphans(conn, table, batchSize) {
  const [rows] = await conn.query(
    `SELECT t.id FROM ${table} t LEFT JOIN api_keys ak ON t.api_key_id = ak.id WHERE ak.id IS NULL LIMIT ?`,
    [batchSize]
  );
  const ids = rows.map(row => row.id);
  if (!ids.length) return 0;
  const placeholders = ids.map(() => '?').join(',');
  const [result] = await conn.query(`DELETE FROM ${table} WHERE id IN (${placeholders})`, ids);
  return result?.affectedRows || 0;
}

async function runOrphanCleanupOnce() {
  const startedAt = Date.now();
  let conn;
  let lockAcquired = false;
  let deletedLogs = 0;
  let deletedUsage = 0;
  const now = Date.now();

  try {
    conn = await pool.getConnection();
    const gotLock = await acquireLock(conn);
    if (!gotLock) return { lockAcquired: false, deletedLogs, deletedUsage, durationMs: 0 };
    lockAcquired = true;

    while (true) {
      let removedAny = false;
      if (!runOrphanCleanupOnce.lastRequestRunAt || now - runOrphanCleanupOnce.lastRequestRunAt >= REQUEST_LOG_ORPHAN_CLEANUP_INTERVAL_MS) {
        const removedLogs = await deleteOrphans(conn, 'request_log', REQUEST_LOG_ORPHAN_CLEANUP_BATCH_SIZE);
        deletedLogs += removedLogs;
        removedAny = removedAny || removedLogs > 0;
        if (removedLogs < REQUEST_LOG_ORPHAN_CLEANUP_BATCH_SIZE) runOrphanCleanupOnce.lastRequestRunAt = now;
      }
      if (!runOrphanCleanupOnce.lastUsageRunAt || now - runOrphanCleanupOnce.lastUsageRunAt >= USAGE_MONTHLY_ORPHAN_CLEANUP_INTERVAL_MS) {
        const removedUsage = await deleteOrphans(conn, 'usage_monthly', USAGE_MONTHLY_ORPHAN_CLEANUP_BATCH_SIZE);
        deletedUsage += removedUsage;
        removedAny = removedAny || removedUsage > 0;
        if (removedUsage < USAGE_MONTHLY_ORPHAN_CLEANUP_BATCH_SIZE) runOrphanCleanupOnce.lastUsageRunAt = now;
      }
      if (!removedAny) break;
    }

    return { lockAcquired: true, deletedLogs, deletedUsage, durationMs: Date.now() - startedAt };
  } catch (err) {
    return { lockAcquired, deletedLogs, deletedUsage, durationMs: Date.now() - startedAt, error: err };
  } finally {
    if (lockAcquired && conn) await releaseLock(conn);
    if (conn) conn.release();
  }
}

function startOrphanCleanup({ enabled = DEFAULT_ENABLED } = {}) {
  if (!enabled || started) return intervalHandle || timeoutHandle;
  started = true;
  const initialDelayMs = Math.min(REQUEST_LOG_ORPHAN_CLEANUP_INITIAL_DELAY_MS, USAGE_MONTHLY_ORPHAN_CLEANUP_INITIAL_DELAY_MS);
  const tickIntervalMs = Math.min(REQUEST_LOG_ORPHAN_CLEANUP_INTERVAL_MS, USAGE_MONTHLY_ORPHAN_CLEANUP_INTERVAL_MS, 60 * 1000);
  const runOnce = () => runOrphanCleanupOnce();
  timeoutHandle = setTimeout(() => {
    runOnce();
    intervalHandle = setInterval(runOnce, tickIntervalMs);
  }, initialDelayMs);
  return intervalHandle;
}

function stopOrphanCleanup() {
  if (timeoutHandle) clearTimeout(timeoutHandle);
  if (intervalHandle) clearInterval(intervalHandle);
  timeoutHandle = null;
  intervalHandle = null;
  started = false;
}

module.exports = { runOrphanCleanupOnce, startOrphanCleanup, stopOrphanCleanup };
