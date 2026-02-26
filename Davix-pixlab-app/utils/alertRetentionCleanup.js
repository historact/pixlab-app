const { pool } = require('../db');
const { logRuntime } = require('./logger');

const ALERT_DELIVERIES_LOCK_NAME = 'pixlab_alert_deliveries_retention';
const ALERT_EVENTS_LOCK_NAME = 'pixlab_alert_events_retention';

const DEFAULT_ALERT_DELIVERIES_ENABLED = process.env.ALERT_DELIVERIES_RETENTION_ENABLED !== 'false';
const DEFAULT_ALERT_DELIVERIES_DAYS = parseInt(process.env.ALERT_DELIVERIES_RETENTION_DAYS, 10) || 90;
const DEFAULT_ALERT_DELIVERIES_INTERVAL_MS =
  parseInt(process.env.ALERT_DELIVERIES_RETENTION_INTERVAL_MS, 10) || 24 * 60 * 60 * 1000;
const DEFAULT_ALERT_DELIVERIES_INITIAL_DELAY_MS =
  parseInt(process.env.ALERT_DELIVERIES_RETENTION_INITIAL_DELAY_MS, 10) || 60 * 1000;
const DEFAULT_ALERT_DELIVERIES_BATCH_SIZE = parseInt(process.env.ALERT_DELIVERIES_RETENTION_BATCH_SIZE, 10) || 5000;

const DEFAULT_ALERT_EVENTS_ENABLED = process.env.ALERT_EVENTS_RETENTION_ENABLED !== 'false';
const DEFAULT_ALERT_EVENTS_DAYS = parseInt(process.env.ALERT_EVENTS_RETENTION_DAYS, 10) || 90;
const DEFAULT_ALERT_EVENTS_INTERVAL_MS = parseInt(process.env.ALERT_EVENTS_RETENTION_INTERVAL_MS, 10) || 24 * 60 * 60 * 1000;
const DEFAULT_ALERT_EVENTS_INITIAL_DELAY_MS =
  parseInt(process.env.ALERT_EVENTS_RETENTION_INITIAL_DELAY_MS, 10) || 60 * 1000;
const DEFAULT_ALERT_EVENTS_BATCH_SIZE = parseInt(process.env.ALERT_EVENTS_RETENTION_BATCH_SIZE, 10) || 5000;

let deliveriesIntervalHandle = null;
let deliveriesTimeoutHandle = null;
let deliveriesStarted = false;

let eventsIntervalHandle = null;
let eventsTimeoutHandle = null;
let eventsStarted = false;

async function acquireLock(conn, lockName) {
  const [rows] = await conn.query('SELECT GET_LOCK(?, 0) AS got', [lockName]);
  return rows?.[0]?.got === 1;
}

async function releaseLock(conn, lockName) {
  try {
    const [rows] = await conn.query('SELECT RELEASE_LOCK(?) AS released', [lockName]);
    return rows?.[0]?.released === 1;
  } catch (err) {
    logRuntime('alert_retention.lock_release_failed', { lockName, message: err.message }, 'error');
    return false;
  }
}

async function deleteAlertDeliveriesBatch(conn, retentionDays, batchSize) {
  const [result] = await conn.query(
    `DELETE FROM alert_deliveries
      WHERE created_at < (UTC_TIMESTAMP() - INTERVAL ? DAY)
      ORDER BY created_at
      LIMIT ?`,
    [retentionDays, batchSize]
  );
  return result?.affectedRows || 0;
}

async function deleteAlertEventsBatch(conn, retentionDays, batchSize) {
  const [result] = await conn.query(
    `DELETE FROM alert_events
      WHERE created_at < (UTC_TIMESTAMP() - INTERVAL ? DAY)
      ORDER BY created_at
      LIMIT ?`,
    [retentionDays, batchSize]
  );
  return result?.affectedRows || 0;
}

async function runAlertDeliveriesRetentionOnce({
  retentionDays = DEFAULT_ALERT_DELIVERIES_DAYS,
  batchSize = DEFAULT_ALERT_DELIVERIES_BATCH_SIZE,
} = {}) {
  const startedAt = Date.now();
  let conn;
  let lockAcquired = false;
  let deletedTotal = 0;

  try {
    conn = await pool.getConnection();
    const gotLock = await acquireLock(conn, ALERT_DELIVERIES_LOCK_NAME);
    if (!gotLock) {
      logRuntime('alert_deliveries_retention.lock_busy', {}, 'warn');
      return { lockAcquired: false, deletedTotal, durationMs: 0 };
    }
    lockAcquired = true;

    while (true) {
      const removed = await deleteAlertDeliveriesBatch(conn, retentionDays, batchSize);
      deletedTotal += removed;
      if (!removed || removed < batchSize) break;
    }

    const durationMs = Date.now() - startedAt;
    logRuntime('alert_deliveries_retention.cleanup_complete', { deletedTotal, durationMs }, 'info');
    return { lockAcquired: true, deletedTotal, durationMs };
  } catch (err) {
    logRuntime('alert_deliveries_retention.cleanup_error', { message: err.message, stack: err.stack }, 'error');
    return { lockAcquired, deletedTotal, durationMs: Date.now() - startedAt, error: err };
  } finally {
    if (lockAcquired && conn) {
      await releaseLock(conn, ALERT_DELIVERIES_LOCK_NAME);
    }
    if (conn) conn.release();
  }
}

async function runAlertEventsRetentionOnce({
  retentionDays = DEFAULT_ALERT_EVENTS_DAYS,
  batchSize = DEFAULT_ALERT_EVENTS_BATCH_SIZE,
} = {}) {
  const startedAt = Date.now();
  let conn;
  let lockAcquired = false;
  let deletedTotal = 0;

  try {
    conn = await pool.getConnection();
    const gotLock = await acquireLock(conn, ALERT_EVENTS_LOCK_NAME);
    if (!gotLock) {
      logRuntime('alert_events_retention.lock_busy', {}, 'warn');
      return { lockAcquired: false, deletedTotal, durationMs: 0 };
    }
    lockAcquired = true;

    while (true) {
      const removed = await deleteAlertEventsBatch(conn, retentionDays, batchSize);
      deletedTotal += removed;
      if (!removed || removed < batchSize) break;
    }

    const durationMs = Date.now() - startedAt;
    logRuntime('alert_events_retention.cleanup_complete', { deletedTotal, durationMs }, 'info');
    return { lockAcquired: true, deletedTotal, durationMs };
  } catch (err) {
    logRuntime('alert_events_retention.cleanup_error', { message: err.message, stack: err.stack }, 'error');
    return { lockAcquired, deletedTotal, durationMs: Date.now() - startedAt, error: err };
  } finally {
    if (lockAcquired && conn) {
      await releaseLock(conn, ALERT_EVENTS_LOCK_NAME);
    }
    if (conn) conn.release();
  }
}

function startAlertDeliveriesRetentionCleanup({
  enabled = DEFAULT_ALERT_DELIVERIES_ENABLED,
  retentionDays = DEFAULT_ALERT_DELIVERIES_DAYS,
  intervalMs = DEFAULT_ALERT_DELIVERIES_INTERVAL_MS,
  initialDelayMs = DEFAULT_ALERT_DELIVERIES_INITIAL_DELAY_MS,
  batchSize = DEFAULT_ALERT_DELIVERIES_BATCH_SIZE,
} = {}) {
  if (!enabled || deliveriesStarted) return deliveriesIntervalHandle || deliveriesTimeoutHandle;
  deliveriesStarted = true;
  const runOnce = () => runAlertDeliveriesRetentionOnce({ retentionDays, batchSize });
  deliveriesTimeoutHandle = setTimeout(() => {
    runOnce();
    deliveriesIntervalHandle = setInterval(runOnce, intervalMs);
  }, initialDelayMs);
  logRuntime('alert_deliveries_retention.scheduled', { retentionDays, intervalMs, initialDelayMs, batchSize }, 'info');
  return deliveriesIntervalHandle;
}

function startAlertEventsRetentionCleanup({
  enabled = DEFAULT_ALERT_EVENTS_ENABLED,
  retentionDays = DEFAULT_ALERT_EVENTS_DAYS,
  intervalMs = DEFAULT_ALERT_EVENTS_INTERVAL_MS,
  initialDelayMs = DEFAULT_ALERT_EVENTS_INITIAL_DELAY_MS,
  batchSize = DEFAULT_ALERT_EVENTS_BATCH_SIZE,
} = {}) {
  if (!enabled || eventsStarted) return eventsIntervalHandle || eventsTimeoutHandle;
  eventsStarted = true;
  const runOnce = () => runAlertEventsRetentionOnce({ retentionDays, batchSize });
  eventsTimeoutHandle = setTimeout(() => {
    runOnce();
    eventsIntervalHandle = setInterval(runOnce, intervalMs);
  }, initialDelayMs);
  logRuntime('alert_events_retention.scheduled', { retentionDays, intervalMs, initialDelayMs, batchSize }, 'info');
  return eventsIntervalHandle;
}

function stopAlertRetentionCleanup() {
  if (deliveriesTimeoutHandle) {
    clearTimeout(deliveriesTimeoutHandle);
    deliveriesTimeoutHandle = null;
  }
  if (deliveriesIntervalHandle) {
    clearInterval(deliveriesIntervalHandle);
    deliveriesIntervalHandle = null;
  }
  deliveriesStarted = false;

  if (eventsTimeoutHandle) {
    clearTimeout(eventsTimeoutHandle);
    eventsTimeoutHandle = null;
  }
  if (eventsIntervalHandle) {
    clearInterval(eventsIntervalHandle);
    eventsIntervalHandle = null;
  }
  eventsStarted = false;
}

module.exports = {
  runAlertDeliveriesRetentionOnce,
  runAlertEventsRetentionOnce,
  startAlertDeliveriesRetentionCleanup,
  startAlertEventsRetentionCleanup,
  stopAlertRetentionCleanup,
};
