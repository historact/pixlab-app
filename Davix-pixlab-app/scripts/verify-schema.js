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
      throw new Error(`schema_migrations has partial rows (started but not applied): ${status.health.partialEntries.join(', ')}`);
    }
    if (status.health.missingFiles.length) {
      throw new Error(`schema_migrations references missing migration files: ${status.health.missingFiles.join(', ')}`);
    }
    if (status.health.checksumMismatches.length) {
      throw new Error(`schema_migrations checksum mismatch for migration files: ${status.health.checksumMismatches.join(', ')}`);
    }
    if (status.pending.length) {
      throw new Error(`pending migrations detected: ${status.pending.join(', ')} (run: npm run migrate)`);
    }

    conn = await pool.getConnection();
    await verifySchemaIntegrity(conn);
    console.log('Schema verification passed.');
    process.exit(0);
  } catch (err) {
    console.error('Schema verification failed:', err.message);
    if (!process.env.DB_HOST || !process.env.DB_USER || !process.env.DB_NAME) {
      console.error('Hint: DB_HOST, DB_USER, and DB_NAME must be set for schema checks.');
    }
    process.exitCode = 1;
  } finally {
    if (conn) conn.release();
    await closePool();
  }
})();
