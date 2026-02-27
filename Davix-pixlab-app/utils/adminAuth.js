const fs = require('fs');
const path = require('path');
const { authenticator } = require('otplib');
const { createHash } = require('crypto');
const { hashApiKey } = require('./apiKeys');
const { isProduction } = require('./config');
const { logAudit, logRuntime, LOG_DIR } = require('./logger');
const { pool } = require('../db');
const bcrypt = require('bcrypt');
const DEV_TOTP_PATH = path.join(LOG_DIR, 'admin-totp-dev.json');

const loginAttempts = new Map();

function ensureLogDir() {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function normalizeKey(ip, username) {
  return `${ip || 'unknown'}:${username || 'admin'}`;
}

function hashSubject(ip, username) {
  return createHash('sha256').update(normalizeKey(ip, username)).digest('hex');
}

function getLoginConfig() {
  const windowMinutes = parseInt(process.env.ADMIN_LOGIN_WINDOW_MINUTES, 10) || 15;
  const maxAttempts = parseInt(process.env.ADMIN_LOGIN_MAX_ATTEMPTS, 10) || 5;
  const lockMinutes = parseInt(process.env.ADMIN_LOGIN_LOCK_MINUTES, 10) || 15;
  return { windowMinutes, maxAttempts, lockMinutes };
}

function recordFailureMemory(ip, username) {
  const key = normalizeKey(ip, username);
  const now = Date.now();
  const { windowMinutes, maxAttempts, lockMinutes } = getLoginConfig();
  const windowMs = windowMinutes * 60 * 1000;
  const lockMs = lockMinutes * 60 * 1000;

  const entry = loginAttempts.get(key) || { count: 0, firstAt: now, lockUntil: 0 };
  if (now - entry.firstAt > windowMs) {
    entry.count = 0;
    entry.firstAt = now;
  }
  entry.count += 1;
  if (entry.count >= maxAttempts) {
    entry.lockUntil = now + lockMs;
  }
  loginAttempts.set(key, entry);
  return entry;
}

function checkLockoutMemory(ip, username) {
  const key = normalizeKey(ip, username);
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry) return { allowed: true };
  if (entry.lockUntil && entry.lockUntil > now) {
    return { allowed: false, retryAfterMs: entry.lockUntil - now };
  }
  return { allowed: true };
}

async function recordFailureDb(ip, username) {
  const { windowMinutes, maxAttempts, lockMinutes } = getLoginConfig();
  const now = new Date();
  const windowMs = windowMinutes * 60 * 1000;
  const lockMs = lockMinutes * 60 * 1000;
  const subjectHash = hashSubject(ip, username);
  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();
    const [rows] = await conn.query(
      `SELECT count, first_attempt_at, lock_until
         FROM admin_login_lockouts
        WHERE subject_hash = ?
        LIMIT 1
        FOR UPDATE`,
      [subjectHash]
    );

    let count = 1;
    let firstAttemptAt = now;
    let lockUntil = null;

    if (rows.length) {
      const row = rows[0];
      const firstAt = row.first_attempt_at ? new Date(row.first_attempt_at) : now;
      const elapsed = now.getTime() - firstAt.getTime();
      if (elapsed <= windowMs) {
        count = Number(row.count || 0) + 1;
        firstAttemptAt = firstAt;
      }
    }

    if (count >= maxAttempts) {
      lockUntil = new Date(now.getTime() + lockMs);
    }

    await conn.query(
      `INSERT INTO admin_login_lockouts (subject_hash, ip, username, count, first_attempt_at, lock_until)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         ip = VALUES(ip),
         username = VALUES(username),
         count = VALUES(count),
         first_attempt_at = VALUES(first_attempt_at),
         lock_until = VALUES(lock_until),
         updated_at = UTC_TIMESTAMP()`,
      [subjectHash, ip || 'unknown', username || 'admin', count, firstAttemptAt, lockUntil]
    );

    await conn.commit();
    return { count, firstAt: firstAttemptAt.getTime(), lockUntil: lockUntil ? lockUntil.getTime() : 0 };
  } catch (err) {
    if (conn) {
      try {
        await conn.rollback();
      } catch (_) {}
    }
    throw err;
  } finally {
    if (conn) conn.release();
  }
}

async function checkLockoutDb(ip, username) {
  const now = Date.now();
  const subjectHash = hashSubject(ip, username);
  const [rows] = await pool.query(
    `SELECT lock_until
       FROM admin_login_lockouts
      WHERE subject_hash = ?
      LIMIT 1`,
    [subjectHash]
  );
  const lockUntil = rows?.[0]?.lock_until ? new Date(rows[0].lock_until).getTime() : 0;
  if (lockUntil > now) {
    return { allowed: false, retryAfterMs: lockUntil - now };
  }
  return { allowed: true };
}

async function recordFailure(ip, username) {
  try {
    return await recordFailureDb(ip, username);
  } catch (err) {
    if (isProduction()) {
      logRuntime('admin.login_lockout.storage_error', { stage: 'record_failure', message: err.message }, 'error');
      return { storageError: true, message: 'Admin login lockout storage unavailable.' };
    }
    logRuntime('admin.login_lockout.storage_error', { stage: 'record_failure', message: err.message }, 'warn');
    return recordFailureMemory(ip, username);
  }
}

async function checkLockout(ip, username) {
  try {
    return await checkLockoutDb(ip, username);
  } catch (err) {
    if (isProduction()) {
      logRuntime('admin.login_lockout.storage_error', { stage: 'check_lockout', message: err.message }, 'error');
      return { allowed: false, retryAfterMs: 60 * 1000, storageError: true };
    }
    logRuntime('admin.login_lockout.storage_error', { stage: 'check_lockout', message: err.message }, 'warn');
    return checkLockoutMemory(ip, username);
  }
}

async function verifyPassword(input) {
  const hash = process.env.ADMIN_PASSWORD_HASH || '';
  if (hash) {
    if (!hash.startsWith('$2')) {
      throw new Error('ADMIN_PASSWORD_HASH must be a bcrypt hash');
    }
    return bcrypt.compare(input, hash);
  }
  if (!isProduction()) {
    const fallback = process.env.ADMIN_PASSWORD || 'admin';
    if (!process.env.ADMIN_PASSWORD) {
      logRuntime('admin.password.default_used', { message: 'Using default dev admin password.' }, 'warn');
    }
    return input === fallback;
  }
  return false;
}

async function getTotpSecret() {
  const secret = process.env.ADMIN_TOTP_SECRET || null;
  if (secret) return { secret, source: 'env' };
  if (isProduction()) return { secret: null, source: 'missing' };
  ensureLogDir();
  if (fs.existsSync(DEV_TOTP_PATH)) {
    const raw = JSON.parse(fs.readFileSync(DEV_TOTP_PATH, 'utf8'));
    return { secret: raw.secret || null, source: 'dev' };
  }
  const generated = authenticator.generateSecret();
  fs.writeFileSync(DEV_TOTP_PATH, JSON.stringify({ secret: generated, shown: false }, null, 2));
  return { secret: generated, source: 'dev' };
}

function markDevTotpShown() {
  if (!fs.existsSync(DEV_TOTP_PATH)) return;
  const raw = JSON.parse(fs.readFileSync(DEV_TOTP_PATH, 'utf8'));
  raw.shown = true;
  fs.writeFileSync(DEV_TOTP_PATH, JSON.stringify(raw, null, 2));
}

function canShowDevTotp() {
  if (!fs.existsSync(DEV_TOTP_PATH)) return false;
  const raw = JSON.parse(fs.readFileSync(DEV_TOTP_PATH, 'utf8'));
  return !raw.shown;
}

function verifyTotp(token, secret) {
  if (!secret) return false;
  return authenticator.check(token, secret);
}

async function ensureAdminPasswordHash(plaintext) {
  return hashApiKey(plaintext);
}

function logLoginFailure(payload) {
  logAudit('admin.login.failed', payload, 'warn');
}

function logLoginSuccess(payload) {
  logAudit('admin.login.success', payload, 'info');
}

module.exports = {
  recordFailure,
  checkLockout,
  verifyPassword,
  getTotpSecret,
  verifyTotp,
  ensureAdminPasswordHash,
  canShowDevTotp,
  markDevTotpShown,
  logLoginFailure,
  logLoginSuccess,
};
