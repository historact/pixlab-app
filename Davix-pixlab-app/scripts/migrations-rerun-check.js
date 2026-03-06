#!/usr/bin/env node
require('../utils/loadEnv');
const { runMigrations, getMigrationStatus, closePool } = require('../db');

(async () => {
  try {
    const first = await runMigrations();
    const second = await runMigrations();
    const status = await getMigrationStatus();

    console.log(`first_run_applied=${first.length}`);
    console.log(`second_run_applied=${second.length}`);
    console.log(`pending=${status.pending.length}`);

    if (second.some(name => !String(name).startsWith('marked_baseline:') && !String(name).startsWith('reconciled:'))) {
      throw new Error(`Expected second run to be a no-op, got: ${second.join(', ')}`);
    }

    if (status.health.duplicateEntries.length) {
      throw new Error('schema_migrations has duplicate entries');
    }

    await closePool();
    process.exit(0);
  } catch (err) {
    console.error('migrations-rerun-check failed:', err.message || err);
    try {
      await closePool();
    } catch (_) {}
    process.exit(1);
  }
})();
