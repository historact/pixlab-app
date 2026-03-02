const fs = require('fs');
const path = require('path');
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
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_schema_migrations_name (name)
    )`
  );

  const hasUnique = await indexExists(conn, 'schema_migrations', 'uq_schema_migrations_name');
  if (!hasUnique) {
    await conn.query('ALTER TABLE schema_migrations ADD UNIQUE KEY uq_schema_migrations_name (name)');
  }
}



async function isBaselineCompatible(conn) {
  const expectedTables = [
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
  ];

  for (const tableName of expectedTables) {
    if (!(await tableExists(conn, tableName))) {
      return { ok: false, reason: `Missing required table: ${tableName}` };
    }
  }

  const hasAdminSessionExpiresIndex = await indexExists(conn, 'admin_sessions', 'idx_admin_sessions_expires');
  if (!hasAdminSessionExpiresIndex) {
    return { ok: false, reason: 'Missing required index: admin_sessions.idx_admin_sessions_expires' };
  }

  const [expiresIndexRows] = await conn.query(
    `SELECT COUNT(*) AS cnt
       FROM information_schema.statistics
      WHERE table_schema = DATABASE()
        AND table_name = 'admin_sessions'
        AND column_name = 'expires'`
  );
  if (Number(expiresIndexRows?.[0]?.cnt || 0) === 0) {
    return { ok: false, reason: 'Missing index on admin_sessions.expires' };
  }

  const signatureColumns = [
    ['api_keys', 'key_last4'],
    ['api_keys', 'rotated_at'],
    ['request_log', 'request_id'],
    ['alert_state', 'incident_id'],
    ['internal_rate_limit_windows', 'key_hash'],
  ];

  for (const [tableName, columnName] of signatureColumns) {
    if (!(await columnExists(conn, tableName, columnName))) {
      return { ok: false, reason: `Missing required column: ${tableName}.${columnName}` };
    }
  }

  return { ok: true };
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
        },
      };
    }

    const [appliedRows] = await conn.query('SELECT name, applied_at FROM schema_migrations ORDER BY id ASC');
    const [duplicateRows] = await conn.query(
      `SELECT name, COUNT(*) AS cnt
         FROM schema_migrations
        GROUP BY name
       HAVING COUNT(*) > 1`
    );

    const hasUniqueNameIndex = await indexExists(conn, 'schema_migrations', 'uq_schema_migrations_name');
    const appliedNames = new Set(appliedRows.map(row => row.name));

    return {
      applied: appliedRows,
      pending: files.filter(file => !appliedNames.has(file)),
      health: {
        trackingTableExists,
        hasUniqueNameIndex,
        duplicateEntries: duplicateRows,
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
      const [appliedRows] = await conn.query('SELECT name FROM schema_migrations ORDER BY id ASC');
      const appliedNames = new Set(appliedRows.map(row => row.name));
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
            `Existing DB has migration history but baseline is not recorded and schema is not baseline-compatible (${compatibility.reason}). Refusing to proceed. Fix by (a) restoring old migrations OR (b) creating a one-time repair migration OR (c) resetting schema_migrations under controlled procedure.`
          );
        }

        await conn.query('INSERT IGNORE INTO schema_migrations (name, applied_at) VALUES (?, NOW())', [baselineFile]);
        appliedNames.add(baselineFile);
        applied.push(`marked_baseline:${baselineFile}`);
      }

      for (const file of files) {
        if (appliedNames.has(file)) continue;

        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        try {
          await conn.query(sql);
          await conn.query('INSERT IGNORE INTO schema_migrations (name, applied_at) VALUES (?, NOW())', [file]);
          applied.push(file);
          appliedNames.add(file);
        } catch (err) {
          logRuntime('migrations.error', { migration: file, message: err.message, sql, code: err.code }, 'error');
          err.message = `Migration failed (${file}): ${err.message}`;
          throw err;
        }
      }
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
};
