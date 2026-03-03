const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mysql = require('mysql2/promise');
const { logRuntime } = require('./utils/logger');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'pixlab',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: 'Z',
  multipleStatements: false,
});

async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

let poolClosed = false;
async function closePool() {
  if (poolClosed) return;
  poolClosed = true;
  try {
    await pool.end();
  } catch (err) {
    console.error('[db] pool.end failed', err);
    logRuntime('db.pool.end_failed', { message: err.message }, 'error');
  }
}

async function tableExists(conn, tableName) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS cnt
       FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name = ?`,
    [tableName]
  );
  return Number(rows?.[0]?.cnt || 0) > 0;
}

async function columnExists(conn, tableName, columnName) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS cnt
       FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [tableName, columnName]
  );
  return Number(rows?.[0]?.cnt || 0) > 0;
}

async function indexExists(conn, tableName, indexName) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS cnt
       FROM information_schema.statistics
      WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?`,
    [tableName, indexName]
  );
  return Number(rows?.[0]?.cnt || 0) > 0;
}

async function ensureSchemaMigrationsTable(conn) {
  await conn.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      checksum CHAR(64) NULL,
      applied TINYINT(1) NOT NULL DEFAULT 1,
      started_at DATETIME NULL,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_schema_migrations_name (name)
    )`
  );

  if (!(await columnExists(conn, 'schema_migrations', 'checksum'))) {
    await conn.query('ALTER TABLE schema_migrations ADD COLUMN checksum CHAR(64) NULL AFTER name');
  }
  if (!(await columnExists(conn, 'schema_migrations', 'applied'))) {
    await conn.query('ALTER TABLE schema_migrations ADD COLUMN applied TINYINT(1) NOT NULL DEFAULT 1 AFTER checksum');
  }
  if (!(await columnExists(conn, 'schema_migrations', 'started_at'))) {
    await conn.query('ALTER TABLE schema_migrations ADD COLUMN started_at DATETIME NULL AFTER applied');
  }

  const hasUnique = await indexExists(conn, 'schema_migrations', 'uq_schema_migrations_name');
  if (!hasUnique) {
    await conn.query('ALTER TABLE schema_migrations ADD UNIQUE KEY uq_schema_migrations_name (name)');
  }
}

function computeMigrationChecksum(filePath) {
  const raw = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(raw).digest('hex');
}

const REQUIRED_SCHEMA = {
  tables: [
    'admin_login_lockouts',
    'admin_sessions',
    'alert_deliveries',
    'alert_events',
    'alert_rules',
    'alert_state',
    'api_keys',
    'burst_limits_window',
    'internal_rate_limit_windows',
    'lease_locks',
    'plans',
    'quota_ledger',
    'rate_limits_daily',
    'request_log',
    'subscription_events',
    'usage_monthly',
  ],
  columns: [
    ['api_keys', 'key_last4'],
    ['api_keys', 'rotated_at'],
    ['request_log', 'request_id'],
    ['alert_state', 'incident_id'],
    ['internal_rate_limit_windows', 'key_hash'],
    ['quota_ledger', 'dedupe_id'],
    ['quota_ledger', 'expires_at'],
    ['quota_ledger', 'status'],
  ],
  indexes: [
    ['admin_sessions', 'idx_admin_sessions_expires'],
    ['schema_migrations', 'uq_schema_migrations_name'],
  ],
};

async function verifySchemaIntegrity(conn) {
  for (const tableName of REQUIRED_SCHEMA.tables) {
    if (!(await tableExists(conn, tableName))) {
      throw new Error(`Schema integrity failed: missing table ${tableName}`);
    }
  }
  for (const [tableName, columnName] of REQUIRED_SCHEMA.columns) {
    if (!(await columnExists(conn, tableName, columnName))) {
      throw new Error(`Schema integrity failed: missing column ${tableName}.${columnName}`);
    }
  }
  for (const [tableName, indexName] of REQUIRED_SCHEMA.indexes) {
    if (!(await indexExists(conn, tableName, indexName))) {
      throw new Error(`Schema integrity failed: missing index ${tableName}.${indexName}`);
    }
  }
}

async function isBaselineCompatible(conn) {
  try {
    await verifySchemaIntegrity(conn);
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

function listMigrationFiles(migrationsDir) {
  return fs
    .readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();
}

async function getMigrationStatus() {
  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.existsSync(migrationsDir) ? listMigrationFiles(migrationsDir) : [];

  const conn = await pool.getConnection();
  try {
    const trackingTableExists = await tableExists(conn, 'schema_migrations');
    if (!trackingTableExists) {
      return {
        applied: [],
        pending: files,
        health: {
          trackingTableExists,
          hasUniqueNameIndex: false,
          duplicateEntries: [],
          partialEntries: [],
        },
      };
    }

    const [appliedRows] = await conn.query(
      'SELECT name, checksum, applied, started_at, applied_at FROM schema_migrations ORDER BY id ASC'
    );
    const [duplicateRows] = await conn.query(
      `SELECT name, COUNT(*) AS cnt
         FROM schema_migrations
        GROUP BY name
       HAVING COUNT(*) > 1`
    );

    const hasUniqueNameIndex = await indexExists(conn, 'schema_migrations', 'uq_schema_migrations_name');
    const appliedNames = new Set(appliedRows.filter(row => Number(row.applied) === 1).map(row => row.name));

    const fileSet = new Set(files);
    const missingFiles = appliedRows
      .filter(row => !fileSet.has(row.name))
      .map(row => row.name);
    const checksumMismatches = appliedRows
      .filter(row => row.checksum && fileSet.has(row.name))
      .filter(row => {
        const fullPath = path.join(migrationsDir, row.name);
        const checksum = computeMigrationChecksum(fullPath);
        return row.checksum !== checksum;
      })
      .map(row => row.name);

    return {
      applied: appliedRows,
      pending: files.filter(file => !appliedNames.has(file)),
      health: {
        trackingTableExists,
        hasUniqueNameIndex,
        duplicateEntries: duplicateRows,
        partialEntries: appliedRows.filter(row => Number(row.applied) !== 1).map(row => row.name),
        missingFiles,
        checksumMismatches,
      },
    };
  } finally {
    conn.release();
  }
}

async function runMigrations() {
  const migrationsDir = path.join(__dirname, 'migrations');
  if (!fs.existsSync(migrationsDir)) return [];

  const files = listMigrationFiles(migrationsDir);
  const baselineFile = '000_canonical_schema_baseline.sql';

  const applied = [];
  const migrationPool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'pixlab',
    waitForConnections: true,
    connectionLimit: 2,
    queueLimit: 0,
    timezone: 'Z',
    multipleStatements: true,
  });

  const conn = await migrationPool.getConnection();
  try {
    await ensureSchemaMigrationsTable(conn);

    const [[lockRow]] = await conn.query('SELECT GET_LOCK(?, 30) AS acquired', ['pixlab_schema_migrations']);
    if (Number(lockRow?.acquired || 0) !== 1) {
      throw new Error('Unable to acquire migration lock (pixlab_schema_migrations).');
    }

    try {
      const [appliedRows] = await conn.query(
        'SELECT name, checksum, applied, started_at, applied_at FROM schema_migrations ORDER BY id ASC'
      );
      const appliedByName = new Map(appliedRows.map(row => [row.name, row]));
      const appliedNames = new Set(appliedRows.filter(row => Number(row.applied) === 1).map(row => row.name));
      for (const row of appliedRows) {
        if (Number(row.applied) !== 1) {
          throw new Error(`Detected partially applied migration record: ${row.name}. Manual recovery required.`);
        }
      }

      const migrationHistoryCount = appliedNames.size;
      const [appTableRows] = await conn.query(
        `SELECT COUNT(*) AS count
           FROM information_schema.tables
          WHERE table_schema = DATABASE()
            AND table_name <> 'schema_migrations'`
      );
      const appTableCount = Number(appTableRows?.[0]?.count || 0);

      if (migrationHistoryCount > 0 && !files.includes(baselineFile)) {
        throw new Error('Migration history exists but baseline file is missing. Refusing to proceed.');
      }

      if (migrationHistoryCount > 0 && appTableCount === 0) {
        throw new Error('Migration history exists but no application tables found. Refusing to proceed.');
      }

      if (migrationHistoryCount > 0 && !appliedNames.has(baselineFile)) {
        const compatibility = await isBaselineCompatible(conn);
        if (!compatibility.ok) {
          throw new Error(
            `Existing DB has migration history but baseline is not recorded and schema is not baseline-compatible (${compatibility.reason}). Refusing to proceed.`
          );
        }

        await conn.query(
          'INSERT IGNORE INTO schema_migrations (name, checksum, applied, started_at, applied_at) VALUES (?, ?, 1, NOW(), NOW())',
          [baselineFile, files.includes(baselineFile) ? computeMigrationChecksum(path.join(migrationsDir, baselineFile)) : null]
        );
        appliedNames.add(baselineFile);
        applied.push(`marked_baseline:${baselineFile}`);
      }

      for (const file of files) {
        const fullPath = path.join(migrationsDir, file);
        const checksum = computeMigrationChecksum(fullPath);
        const existing = appliedByName.get(file);

        if (existing) {
          if (existing.checksum && existing.checksum !== checksum) {
            throw new Error(`Checksum mismatch for applied migration ${file}. Refusing to continue.`);
          }
          if (!existing.checksum) {
            await conn.query('UPDATE schema_migrations SET checksum = ? WHERE name = ?', [checksum, file]);
          }
        }

        if (appliedNames.has(file)) continue;

        const sql = fs.readFileSync(fullPath, 'utf8');
        try {
          await conn.query(
            'INSERT INTO schema_migrations (name, checksum, applied, started_at, applied_at) VALUES (?, ?, 0, NOW(), NOW())',
            [file, checksum]
          );
          await conn.query('START TRANSACTION');
          await conn.query(sql);
          await conn.query('COMMIT');
          await conn.query('UPDATE schema_migrations SET applied = 1, applied_at = NOW() WHERE name = ?', [file]);
          applied.push(file);
          appliedNames.add(file);
          appliedByName.set(file, { name: file, checksum, applied: 1 });
        } catch (err) {
          try {
            await conn.query('ROLLBACK');
          } catch (_) {}
          logRuntime('migrations.error', { migration: file, message: err.message, sql, code: err.code }, 'error');
          err.message = `Migration failed (${file}): ${err.message}`;
          throw err;
        }
      }

      await verifySchemaIntegrity(conn);
    } finally {
      await conn.query('DO RELEASE_LOCK(?)', ['pixlab_schema_migrations']);
    }
  } finally {
    conn.release();
    await migrationPool.end();
  }

  return applied;
}

module.exports = {
  pool,
  query,
  runMigrations,
  closePool,
  getMigrationStatus,
  tableExists,
  columnExists,
  indexExists,
  verifySchemaIntegrity,
};
