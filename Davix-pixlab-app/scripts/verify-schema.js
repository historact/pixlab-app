#!/usr/bin/env node
const { pool, closePool, getMigrationStatus, verifySchemaIntegrity } = require('../db');

(async () => {
  let conn;
  try {
    const status = await getMigrationStatus();
    if (!status.health.trackingTableExists) {
      throw new Error('schema_migrations table missing');
    }
    if (!status.health.hasUniqueNameIndex) {
      throw new Error('schema_migrations unique index missing');
    }
    if (status.health.duplicateEntries.length) {
      throw new Error(`schema_migrations has duplicate rows: ${JSON.stringify(status.health.duplicateEntries)}`);
    }
    if (status.health.partialEntries.length) {
      throw new Error(`schema_migrations has partial rows: ${status.health.partialEntries.join(', ')}`);
    }
    if (status.pending.length) {
      throw new Error(`pending migrations detected: ${status.pending.join(', ')}`);
    }

    conn = await pool.getConnection();
    await verifySchemaIntegrity(conn);
    console.log('Schema verification passed.');
    process.exit(0);
  } catch (err) {
    console.error('Schema verification failed:', err.message);
    process.exitCode = 1;
  } finally {
    if (conn) conn.release();
    await closePool();
  }
})();
