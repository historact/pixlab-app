const { pool, query } = require('../db');

const REQUEST_LOG_COLUMNS = {
  id: 'id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY',
  api_key_id: 'api_key_id BIGINT NOT NULL',
  timestamp: 'timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP',
  endpoint: 'endpoint VARCHAR(32) NULL',
  action: 'action VARCHAR(64) NULL',
  status: 'status VARCHAR(32) NULL',
  ip: 'ip VARCHAR(64) NULL',
  user_agent: 'user_agent VARCHAR(255) NULL',
  bytes_in: 'bytes_in BIGINT NULL DEFAULT 0',
  bytes_out: 'bytes_out BIGINT NULL DEFAULT 0',
  files_processed: 'files_processed INT NULL DEFAULT 0',
  error_code: 'error_code VARCHAR(64) NULL',
  error_message: 'error_message TEXT NULL',
  params_json: 'params_json JSON NULL',
  created_at: 'created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP',
};

const COLUMN_CACHE_TTL_MS = 5 * 60 * 1000;
let cachedColumns = null;
let cachedAt = 0;

async function tableExists(tableName) {
  const rows = await query(
    `SELECT COUNT(*) AS cnt FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?`,
    [tableName]
  );
  return rows[0]?.cnt > 0;
}

async function getTableColumns(tableName) {
  return query(
    `SELECT column_name, data_type, is_nullable FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ?
     ORDER BY ordinal_position`,
    [tableName]
  );
}

async function ensureRequestLogSchema() {
  try {
    const exists = await tableExists('request_log');

    if (!exists) {
      const definitions = Object.values(REQUEST_LOG_COLUMNS);
      const createSql = `CREATE TABLE IF NOT EXISTS request_log (${definitions.join(', ')},
        INDEX idx_api_key_id (api_key_id),
        INDEX idx_timestamp (timestamp),
        INDEX idx_endpoint (endpoint)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`;
      await pool.execute(createSql);
      cachedColumns = null;
      cachedAt = 0;
      return;
    }

    const currentColumns = await query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'request_log'`
    );
    const existing = new Set(currentColumns.map(row => row.column_name));
    const missing = Object.keys(REQUEST_LOG_COLUMNS).filter(col => !existing.has(col));

    for (const col of missing) {
      const definition = REQUEST_LOG_COLUMNS[col];
      await pool.execute(`ALTER TABLE request_log ADD COLUMN ${definition}`);
    }

    if (missing.length) {
      cachedColumns = null;
      cachedAt = 0;
    }
  } catch (err) {
    console.error('ENSURE_REQUEST_LOG_SCHEMA_FAILED', { message: err.message, code: err.code });
  }
}

async function getRequestLogColumns({ refresh = false } = {}) {
  if (!refresh && cachedColumns && Date.now() - cachedAt < COLUMN_CACHE_TTL_MS) {
    return cachedColumns;
  }

  try {
    const rows = await query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'request_log'`
    );
    cachedColumns = rows.map(row => row.column_name);
    cachedAt = Date.now();
    return cachedColumns;
  } catch (err) {
    console.error('REQUEST_LOG_COLUMN_FETCH_FAILED', { message: err.message, code: err.code });
    return [];
  }
}

async function insertRequestLogRow(logRow) {
  await ensureRequestLogSchema();
  const availableCols = await getRequestLogColumns();
  const cols = Object.keys(logRow).filter(col => availableCols.includes(col));
  if (!cols.length) {
    return { inserted: false, insertId: null };
  }

  const placeholders = cols.map(() => '?').join(', ');
  const values = cols.map(col => logRow[col]);
  const [result] = await pool.execute(
    `INSERT INTO request_log (${cols.join(', ')}) VALUES (${placeholders})`,
    values
  );
  return { inserted: true, insertId: result.insertId || null };
}

async function testRequestLogInsert() {
  try {
    const { inserted, insertId } = await insertRequestLogRow({
      timestamp: new Date(),
      api_key_id: 0,
      endpoint: 'diagnostics',
      action: 'request_log_probe',
      status: 'test',
      ip: '0.0.0.0',
      user_agent: 'diagnostic',
      bytes_in: 0,
      bytes_out: 0,
      files_processed: 0,
      error_code: null,
      error_message: null,
      params_json: JSON.stringify({ probe: true, source: 'diagnostics' }),
    });

    let deleted = false;
    if (inserted && insertId) {
      try {
        await pool.execute('DELETE FROM request_log WHERE id = ?', [insertId]);
        deleted = true;
      } catch (cleanupErr) {
        console.error('REQUEST_LOG_TEST_CLEANUP_FAILED', {
          message: cleanupErr.message,
          code: cleanupErr.code,
        });
      }
    }

    return { success: inserted, insertedId: insertId || null, cleanedUp: deleted };
  } catch (err) {
    return { success: false, error: err.message, code: err.code || null };
  }
}

module.exports = {
  ensureRequestLogSchema,
  getRequestLogColumns,
  getTableColumns,
  tableExists,
  insertRequestLogRow,
  testRequestLogInsert,
};
