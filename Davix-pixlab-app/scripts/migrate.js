#!/usr/bin/env node
require('../utils/loadEnv');
const { runMigrations, closePool } = require('../db');

(async () => {
  try {
    const applied = await runMigrations();
    if (!applied.length) {
      console.log('No new migrations to apply.');
    } else {
      console.log(`Applied migrations: ${applied.join(', ')}`);
    }
    await closePool();
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    try {
      await closePool();
    } catch (_) {}
    process.exit(1);
  }
})();
