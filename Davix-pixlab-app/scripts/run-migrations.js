#!/usr/bin/env node
const { runMigrations } = require('../db');

(async () => {
  try {
    const applied = await runMigrations();
    if (!applied.length) {
      console.log('No new migrations to apply.');
    } else {
      console.log(`Applied migrations: ${applied.join(', ')}`);
    }
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
})();
