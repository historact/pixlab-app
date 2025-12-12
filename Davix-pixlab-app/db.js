const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'pixlab',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: 'Z',
  multipleStatements: true,
});

async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

async function runMigrations() {
  const migrationsDir = path.join(__dirname, 'migrations');
  if (!fs.existsSync(migrationsDir)) return [];

  const files = fs
    .readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  const applied = [];
  const conn = await pool.getConnection();
  try {
    await conn.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`
    );

    for (const file of files) {
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
  } finally {
    conn.release();
  }

  return applied;
}

module.exports = { pool, query, runMigrations };
