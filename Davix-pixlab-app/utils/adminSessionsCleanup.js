const LOCK_NAME = 'pixlab_admin_sessions_retention';

async function runAdminSessionsCleanup({ pool, ttlDays, logRuntime, logger = console }) {
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

    const [result] = await pool.execute(
      'DELETE FROM admin_sessions WHERE expires < (UTC_TIMESTAMP() - INTERVAL ? DAY)',
      [ttlDays]
    );
    const durationMs = Date.now() - startedAt;
    logRuntime('admin_sessions.cleanup_complete', {
      deleted: result?.affectedRows || 0,
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

module.exports = {
  LOCK_NAME,
  runAdminSessionsCleanup,
};
