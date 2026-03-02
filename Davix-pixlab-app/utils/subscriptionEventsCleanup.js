const { pool } = require('../db');
const { logRuntime } = require('./logger');
const { getSubscriptionEventSettings } = require('./logger');
const { cleanupSubscriptionEvents } = require('./subscriptionEvents');

const LOCK_NAME = 'pixlab_subscription_events_cleanup';
function parsePositiveIntEnv(name, fallback) {
  const parsed = Number.parseInt(process.env[name], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const SUBSCRIPTION_EVENTS_CLEANUP_INTERVAL_MS = parsePositiveIntEnv(
  'SUBSCRIPTION_EVENTS_CLEANUP_INTERVAL_MS',
  24 * 60 * 60 * 1000
);
const SUBSCRIPTION_EVENTS_CLEANUP_INITIAL_DELAY_MS = parsePositiveIntEnv(
  'SUBSCRIPTION_EVENTS_CLEANUP_INITIAL_DELAY_MS',
  60 * 1000
);
const SUBSCRIPTION_EVENTS_CLEANUP_BATCH_SIZE = parsePositiveIntEnv(
  'SUBSCRIPTION_EVENTS_CLEANUP_BATCH_SIZE',
  5000
);
const SUBSCRIPTION_EVENTS_RETENTION_DAYS = parsePositiveIntEnv(
  'SUBSCRIPTION_EVENTS_RETENTION_DAYS',
  0
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
    if (!gotLock) return { lockAcquired: false, deleted: 0, durationMs: 0 };
    lockAcquired = true;
    const settings = getSubscriptionEventSettings();
    const retentionDays = SUBSCRIPTION_EVENTS_RETENTION_DAYS || settings.retentionDays;
    const { deleted, skipped } = await cleanupSubscriptionEvents({
      retentionDays,
      batchSize: SUBSCRIPTION_EVENTS_CLEANUP_BATCH_SIZE,
    });
    return { lockAcquired: true, deleted, skipped, durationMs: Date.now() - startedAt };
  } catch (err) {
    return { lockAcquired, deleted: 0, durationMs: Date.now() - startedAt, error: err };
  } finally {
    if (lockAcquired && conn) await releaseLock(conn);
    if (conn) conn.release();
  }
}

function startSubscriptionEventsCleanup() {
  if (started) return intervalHandle || timeoutHandle;
  started = true;
  const runOnce = () => runSubscriptionEventsCleanupOnce();
  timeoutHandle = setTimeout(() => {
    runOnce();
    intervalHandle = setInterval(runOnce, SUBSCRIPTION_EVENTS_CLEANUP_INTERVAL_MS);
  }, SUBSCRIPTION_EVENTS_CLEANUP_INITIAL_DELAY_MS);
  return intervalHandle;
}

function stopSubscriptionEventsCleanup() {
  if (timeoutHandle) clearTimeout(timeoutHandle);
  if (intervalHandle) clearInterval(intervalHandle);
  timeoutHandle = null;
  intervalHandle = null;
  started = false;
}

module.exports = { runSubscriptionEventsCleanupOnce, startSubscriptionEventsCleanup, stopSubscriptionEventsCleanup };
