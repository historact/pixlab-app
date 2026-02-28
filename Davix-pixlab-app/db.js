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

function isBenignMigrationError(err) {
  if (!err) return false;
  const message = String(err.message || '').toLowerCase();
  return (
    err.code === 'ER_DUP_FIELDNAME' ||
    err.code === 'ER_DUP_KEYNAME' ||
    err.code === 'ER_TABLE_EXISTS_ERROR' ||
    err.code === 'ER_CANT_DROP_FIELD_OR_KEY' ||
    message.includes('duplicate column name') ||
    message.includes('duplicate key name') ||
    message.includes('already exists')
  );
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

async function applyAlertStateIncidentTracking(conn) {
  if (!(await tableExists(conn, 'alert_state'))) {
    return;
  }

  if (!(await columnExists(conn, 'alert_state', 'incident_id'))) {
    await conn.query('ALTER TABLE alert_state ADD COLUMN incident_id VARCHAR(64) NULL AFTER last_value');
  }

  if (!(await columnExists(conn, 'alert_state', 'last_notified_at'))) {
    await conn.query('ALTER TABLE alert_state ADD COLUMN last_notified_at DATETIME NULL AFTER incident_id');
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

  const BASELINE_FILES = [
    '001_baseline_plans.sql',
    '002_baseline_api_keys.sql',
    '003_baseline_request_log.sql',
    '004_baseline_usage_monthly.sql',
    '005_baseline_subscription_events.sql',
    '006_baseline_quota_ledger.sql',
    '007_baseline_rate_limits_daily.sql',
    '008_baseline_burst_limits_window.sql',
  ];

  const OLD_FILES = [
    '001_api_keys_schema.sql',
    '002_request_log_schema.sql',
    '003_api_keys_identity_constraints.sql',
    '004_api_keys_identity_indexes.sql',
    '005_api_keys_expiry_index.sql',
    '006_request_usage_fk.sql',
    '007_api_keys_plan_fk.sql',
    '008_api_keys_plan_fk_safe.sql',
    '009_rate_limits_daily.sql',
    '010_burst_limits_window.sql',
    '011_plans_schema.sql',
    '012_usage_monthly_schema.sql',
    '013_subscription_events.sql',
    '014_api_keys_key_last4_rotated_at.sql',
    '015_request_log_request_id.sql',
    '016_add_reserved_files.sql',
    '017_quota_ledger.sql',
  ];

  const files = listMigrationFiles(migrationsDir);
  const migrationHandlers = {
    '010_alert_state_incident_tracking.sql': applyAlertStateIncidentTracking,
  };

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
      const [historyRows] = await conn.query(
        'SELECT COUNT(*) AS count FROM schema_migrations'
      );
      const isFresh = (historyRows?.[0]?.count || 0) === 0;

      for (const file of files) {
        if (!isFresh && BASELINE_FILES.includes(file)) {
          await conn.query(
            'INSERT IGNORE INTO schema_migrations (name, applied_at) VALUES (?, NOW())',
            [file]
          );
          applied.push(`marked_baseline:${file}`);
          continue;
        }

        const [existing] = await conn.query('SELECT 1 FROM schema_migrations WHERE name = ? LIMIT 1', [file]);
        if (existing.length) continue;

        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        try {
          const handler = migrationHandlers[file];
          if (handler) {
            await handler(conn);
          } else {
            await conn.query(sql);
          }
          await conn.query('INSERT IGNORE INTO schema_migrations (name, applied_at) VALUES (?, NOW())', [file]);
          applied.push(file);
        } catch (err) {
          if (isBenignMigrationError(err)) {
            console.warn(`[migrations] Benign migration error for ${file}: ${err.message}`);
            logRuntime('migrations.benign_error', { migration: file, message: err.message, sql }, 'warn');
            await conn.query('INSERT IGNORE INTO schema_migrations (name, applied_at) VALUES (?, NOW())', [file]);
            applied.push(`reconciled:${file}`);
            continue;
          }
          logRuntime('migrations.error', { migration: file, message: err.message, sql, code: err.code }, 'error');
          err.message = `Migration failed (${file}): ${err.message}`;
          throw err;
        }
      }

      if (isFresh) {
        for (const file of OLD_FILES) {
          await conn.query(
            'INSERT IGNORE INTO schema_migrations (name, applied_at) VALUES (?, NOW())',
            [file]
          );
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
