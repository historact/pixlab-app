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

  const files = fs
    .readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

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
    await conn.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`
    );

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
      await conn.beginTransaction();
      try {
        await conn.query(sql);
        await conn.query('INSERT INTO schema_migrations (name, applied_at) VALUES (?, NOW())', [file]);
        await conn.commit();
        applied.push(file);
      } catch (err) {
        await conn.rollback();
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
    conn.release();
    await migrationPool.end();
  }

  return applied;
}

module.exports = { pool, query, runMigrations, closePool };
