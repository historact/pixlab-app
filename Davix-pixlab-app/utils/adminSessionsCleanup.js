const LOCK_NAME = 'pixlab_admin_sessions_retention';

let adminSessionsIntervalHandle = null;
let adminSessionsCleanupStarted = false;

async function runAdminSessionsCleanup({ pool, ttlDays, batchSize = 5000, logRuntime, logger = console }) {
  const startedAt = Date.now();
  let lockAcquired = false;

  try {
    const [lockRows] = await pool.query('SELECT GET_LOCK(?, 0) AS lock_acquired', [LOCK_NAME]);
    lockAcquired = Number(lockRows?.[0]?.lock_acquired) === 1;

    if (!lockAcquired) {
      const durationMs = Date.now() - startedAt;
      logRuntime('admin_sessions.cleanup_lock_busy', { lockName: LOCK_NAME, durationMs }, 'info');
      return;
    }

    let deleted = 0;
    while (true) {
      const [result] = await pool.execute(
        'DELETE FROM admin_sessions WHERE expires < (UTC_TIMESTAMP() - INTERVAL ? DAY) LIMIT ?',
        [ttlDays, batchSize]
      );
      const affected = result?.affectedRows || 0;
      deleted += affected;
      if (affected < batchSize) break;
    }
    const durationMs = Date.now() - startedAt;
    logRuntime('admin_sessions.cleanup_complete', {
      deleted,
      durationMs,
      lockName: LOCK_NAME,
    }, 'info');
  } catch (err) {
    logger.error('Admin sessions cleanup failed:', err);
    logRuntime('admin_sessions.cleanup_failed', { message: err.message, code: err.code }, 'warn');
  } finally {
    if (!lockAcquired) return;
    try {
      await pool.query('SELECT RELEASE_LOCK(?) AS lock_released', [LOCK_NAME]);
    } catch (releaseErr) {
      logger.error('Admin sessions cleanup lock release failed:', releaseErr);
      logRuntime('admin_sessions.cleanup_lock_release_failed', { message: releaseErr.message, code: releaseErr.code }, 'warn');
    }
  }
}

function startAdminSessionsCleanup({
  enabled = true,
  intervalMs,
  cleanup,
} = {}) {
  if (!enabled || adminSessionsCleanupStarted) return adminSessionsIntervalHandle;
  if (typeof cleanup !== 'function') return adminSessionsIntervalHandle;

  adminSessionsCleanupStarted = true;
  cleanup();
  adminSessionsIntervalHandle = setInterval(cleanup, intervalMs);
  return adminSessionsIntervalHandle;
}

function stopAdminSessionsCleanup() {
  if (adminSessionsIntervalHandle) {
    clearInterval(adminSessionsIntervalHandle);
    adminSessionsIntervalHandle = null;
  }
  adminSessionsCleanupStarted = false;
}

module.exports = {
  LOCK_NAME,
  runAdminSessionsCleanup,
  startAdminSessionsCleanup,
  stopAdminSessionsCleanup,
};
