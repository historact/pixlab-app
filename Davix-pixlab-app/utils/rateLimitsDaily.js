const net = require('net');
const { pool } = require('../db');

function ipv4ToBuffer(ipv4) {
  const parts = ipv4.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => !Number.isFinite(p) || p < 0 || p > 255)) {
    return null;
  }
  const buf = Buffer.alloc(16);
  buf.fill(0);
  buf[10] = 0xff;
  buf[11] = 0xff;
  buf[12] = parts[0];
  buf[13] = parts[1];
  buf[14] = parts[2];
  buf[15] = parts[3];
  return buf;
}

function expandIpv6(address) {
  const [left, right] = address.split('::');
  const leftParts = left ? left.split(':') : [];
  const rightParts = right ? right.split(':') : [];

  let rightExpanded = rightParts;
  if (rightParts.length && rightParts[rightParts.length - 1].includes('.')) {
    const ipv4Part = rightParts[rightParts.length - 1];
    const ipv4Buf = ipv4ToBuffer(ipv4Part);
    if (!ipv4Buf) return null;
    const hextet1 = ipv4Buf.readUInt16BE(12).toString(16);
    const hextet2 = ipv4Buf.readUInt16BE(14).toString(16);
    rightExpanded = [...rightParts.slice(0, -1), hextet1, hextet2];
  }

  const fillCount = 8 - (leftParts.length + rightExpanded.length);
  if (fillCount < 0) return null;
  const fill = new Array(fillCount).fill('0');
  const parts = [...leftParts, ...fill, ...rightExpanded].map(part => part.padStart(4, '0'));
  if (parts.length !== 8) return null;
  return parts;
}

function ipv6ToBuffer(ipv6) {
  const expanded = expandIpv6(ipv6.toLowerCase());
  if (!expanded) return null;
  const buf = Buffer.alloc(16);
  for (let i = 0; i < expanded.length; i++) {
    const part = parseInt(expanded[i], 16);
    if (!Number.isFinite(part)) return null;
    buf.writeUInt16BE(part, i * 2);
  }
  return buf;
}

function normalizeIpToBinary(ipString) {
  const ip = (ipString || '').trim();
  if (!ip) return Buffer.alloc(16);
  const ipType = net.isIP(ip);
  if (ipType === 4) return ipv4ToBuffer(ip);
  if (ipType === 6) {
    if (ip.startsWith('::ffff:')) {
      const ipv4Candidate = ip.slice(7);
      const mapped = ipv4ToBuffer(ipv4Candidate);
      if (mapped) return mapped;
    }
    return ipv6ToBuffer(ip);
  }
  return Buffer.alloc(16);
}

function getUtcDayString(dayDate = new Date()) {
  return dayDate.toISOString().slice(0, 10);
}

async function incrementAndGetDailyCount({ scope, ip, incrementBy = 1, dayUtc }) {
  let conn;
  const dayValue = dayUtc || getUtcDayString();
  const ipBinary = normalizeIpToBinary(ip);
  try {
    conn = await pool.getConnection();
    await conn.query(
      `INSERT INTO rate_limits_daily (day_utc, scope, ip, count)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE count = LAST_INSERT_ID(count + VALUES(count))`,
      [dayValue, scope, ipBinary, incrementBy]
    );
    const [rows] = await conn.query('SELECT LAST_INSERT_ID() AS count');
    return rows?.[0]?.count || 0;
  } catch (err) {
    console.warn('[rate_limit] DB error while updating rate_limits_daily.', {
      code: err.code,
      errno: err.errno,
      sqlState: err.sqlState,
    });
    throw err;
  } finally {
    if (conn) conn.release();
  }
}

module.exports = {
  normalizeIpToBinary,
  getUtcDayString,
  incrementAndGetDailyCount,
};
