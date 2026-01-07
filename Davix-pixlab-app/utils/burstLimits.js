const { pool } = require('../db');

const fallbackStore = new Map();

function getWindowStartSeconds(windowSeconds) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  return Math.floor(nowSeconds / windowSeconds) * windowSeconds;
}

function formatUtcDateTime(epochSeconds) {
  return new Date(epochSeconds * 1000).toISOString().slice(0, 19).replace('T', ' ');
}

function incrementFallbackCount(key, incrementBy) {
  const current = fallbackStore.get(key) || 0;
  const next = current + incrementBy;
  fallbackStore.set(key, next);
  return next;
}

async function incrementAndGetBurstCount({ apiKeyId, scope, incrementBy = 1, windowSeconds = 60 }) {
  const windowStartSeconds = getWindowStartSeconds(windowSeconds);
  const windowStart = formatUtcDateTime(windowStartSeconds);
  const fallbackKey = `${apiKeyId}:${scope}:${windowStartSeconds}`;
  let conn;
  try {
    conn = await pool.getConnection();
    await conn.query(
      `INSERT INTO burst_limits_window (window_start, api_key_id, scope, count)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE count = LAST_INSERT_ID(count + VALUES(count))`,
      [windowStart, apiKeyId, scope, incrementBy]
    );
    const [rows] = await conn.query('SELECT LAST_INSERT_ID() AS count');
    return { count: rows?.[0]?.count || 0, windowStartSeconds };
  } catch (err) {
    console.warn('[burst_limit] DB error, falling back to memory store.', err);
    const count = incrementFallbackCount(fallbackKey, incrementBy);
    return { count, windowStartSeconds, usedFallback: true };
  } finally {
    if (conn) conn.release();
  }
}

module.exports = {
  incrementAndGetBurstCount,
  getWindowStartSeconds,
};
