const assert = require('assert');
const { runAdminSessionsCleanup, LOCK_NAME } = require('../utils/adminSessionsCleanup');

function makeLogger(events) {
  return {
    info: (...args) => events.push({ type: 'info', args }),
    warn: (...args) => events.push({ type: 'warn', args }),
    error: (...args) => events.push({ type: 'error', args }),
  };
}

async function testLockBusy() {
  const calls = [];
  const runtime = [];
  const pool = {
    async query(sql, params) {
      calls.push({ method: 'query', sql, params });
      if (sql.includes('GET_LOCK')) return [[{ lock_acquired: 0 }]];
      throw new Error('RELEASE_LOCK should not run when lock not acquired');
    },
    async execute() {
      throw new Error('DELETE should not run when lock is busy');
    },
  };
  await runAdminSessionsCleanup({ pool, ttlDays: 10, logRuntime: (evt, data) => runtime.push({ evt, data }), logger: makeLogger([]) });
  assert.strictEqual(calls.length, 1);
  assert.ok(calls[0].sql.includes('GET_LOCK'));
  assert.strictEqual(calls[0].params[0], LOCK_NAME);
  assert.ok(runtime.find(r => r.evt === 'admin_sessions.cleanup_lock_busy'));
}

async function testLockAcquired() {
  const calls = [];
  const runtime = [];
  const pool = {
    async query(sql, params) {
      calls.push({ method: 'query', sql, params });
      if (sql.includes('GET_LOCK')) return [[{ lock_acquired: 1 }]];
      if (sql.includes('RELEASE_LOCK')) return [[{ lock_released: 1 }]];
      throw new Error(`Unexpected query: ${sql}`);
    },
    async execute(sql, params) {
      calls.push({ method: 'execute', sql, params });
      return [{ affectedRows: 7 }];
    },
  };
  await runAdminSessionsCleanup({ pool, ttlDays: 12, logRuntime: (evt, data) => runtime.push({ evt, data }), logger: makeLogger([]) });
  assert.ok(calls.find(c => c.method === 'query' && c.sql.includes('GET_LOCK')));
  assert.ok(calls.find(c => c.method === 'execute' && c.sql.includes('DELETE FROM admin_sessions')));
  assert.ok(calls.find(c => c.method === 'query' && c.sql.includes('RELEASE_LOCK')));
  assert.ok(runtime.find(r => r.evt === 'admin_sessions.cleanup_complete' && r.data.deleted === 7));
}

async function main() {
  await testLockBusy();
  await testLockAcquired();
  console.log('check-admin-sessions-lock: OK');
}

main().catch(err => {
  console.error('check-admin-sessions-lock: FAILED', err);
  process.exit(1);
});
