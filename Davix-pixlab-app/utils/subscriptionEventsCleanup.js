const { pool } = require('../db');
const { logRuntime } = require('./logger');
const { getSubscriptionEventSettings } = require('./logger');
const { cleanupSubscriptionEvents } = require('./subscriptionEvents');

const LOCK_NAME = 'pixlab_subscription_events_cleanup';

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
    console.error('[DAVIX][subscription_events] failed to release lock', err);
    logRuntime('subscription_events.lock_release_failed', { message: err.message }, 'error');
    return false;
  }
}

async function runSubscriptionEventsCleanupOnce() {
  const startedAt = Date.now();
  let conn;
  let lockAcquired = false;
  try {
    conn = await pool.getConnection();
    const gotLock = await acquireLock(conn);
    if (!gotLock) {
      logRuntime('subscription_events.lock_busy', {}, 'warn');
      return { lockAcquired: false, deleted: 0, durationMs: 0 };
    }
    lockAcquired = true;
    const settings = getSubscriptionEventSettings();
    const { deleted, skipped } = await cleanupSubscriptionEvents({ retentionDays: settings.retentionDays });
    const durationMs = Date.now() - startedAt;
    logRuntime('subscription_events.cleanup_complete', { deleted, skipped, durationMs }, 'info');
    return { lockAcquired: true, deleted, skipped, durationMs };
  } catch (err) {
    logRuntime('subscription_events.cleanup_error', { message: err.message }, 'error');
    return { lockAcquired, deleted: 0, durationMs: Date.now() - startedAt, error: err };
  } finally {
    if (lockAcquired && conn) {
      await releaseLock(conn);
    }
    if (conn) conn.release();
  }
}

function startSubscriptionEventsCleanup({
  intervalDays = 1,
  initialDelayMs = 60 * 1000,
} = {}) {
  if (started) return intervalHandle || timeoutHandle;
  started = true;
  const intervalMs = Math.max(1, Number(intervalDays)) * 24 * 60 * 60 * 1000;
  const runOnce = () => runSubscriptionEventsCleanupOnce();
  timeoutHandle = setTimeout(() => {
    runOnce();
    intervalHandle = setInterval(runOnce, intervalMs);
  }, initialDelayMs);
  logRuntime('subscription_events.cleanup_scheduled', { intervalDays, initialDelayMs }, 'info');
  return intervalHandle;
}

function stopSubscriptionEventsCleanup() {
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
  runSubscriptionEventsCleanupOnce,
  startSubscriptionEventsCleanup,
  stopSubscriptionEventsCleanup,
};
