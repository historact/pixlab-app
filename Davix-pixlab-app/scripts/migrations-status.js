#!/usr/bin/env node
const { getMigrationStatus, closePool } = require('../db');

(async () => {
  try {
    const status = await getMigrationStatus();

    console.log('schema_migrations health:');
    console.log(`- tracking table exists: ${status.health.trackingTableExists ? 'yes' : 'no'}`);
    console.log(`- unique name index: ${status.health.hasUniqueNameIndex ? 'yes' : 'no'}`);
    if (status.health.duplicateEntries.length) {
      console.log('- duplicate entries:');
      for (const row of status.health.duplicateEntries) {
        console.log(`  - ${row.name} (${row.cnt})`);
      }
    } else {
      console.log('- duplicate entries: none');
    }

    console.log('');
    console.log('applied migrations:');
    if (!status.applied.length) {
      console.log('- none');
    } else {
      for (const row of status.applied) {
        console.log(`- ${row.name} @ ${row.applied_at instanceof Date ? row.applied_at.toISOString() : row.applied_at}`);
      }
    }

    console.log('');
    console.log('pending migrations:');
    if (!status.pending.length) {
      console.log('- none');
    } else {
      for (const name of status.pending) {
        console.log(`- ${name}`);
      }
    }

    await closePool();
    process.exit(status.health.duplicateEntries.length ? 2 : 0);
  } catch (err) {
    console.error('Failed to inspect migration status:', err);
    try {
      await closePool();
    } catch (_) {}
    process.exit(1);
  }
})();
