const fs = require('fs');
const path = require('path');
const { authenticator } = require('otplib');
const { verifyApiKeyHash, hashApiKey } = require('./apiKeys');
const { isProduction } = require('./config');
const { logAudit, logRuntime } = require('./logger');

const LOG_DIR = path.join(__dirname, '..', 'logs');
const DEV_TOTP_PATH = path.join(LOG_DIR, 'admin-totp-dev.json');

const loginAttempts = new Map();

function ensureLogDir() {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function normalizeKey(ip, username) {
  return `${ip || 'unknown'}:${username || 'admin'}`;
}

function getLoginConfig() {
  const windowMinutes = parseInt(process.env.ADMIN_LOGIN_WINDOW_MINUTES, 10) || 15;
  const maxAttempts = parseInt(process.env.ADMIN_LOGIN_MAX_ATTEMPTS, 10) || 5;
  const lockMinutes = parseInt(process.env.ADMIN_LOGIN_LOCK_MINUTES, 10) || 15;
  return { windowMinutes, maxAttempts, lockMinutes };
}

function recordFailure(ip, username) {
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

function checkLockout(ip, username) {
  const key = normalizeKey(ip, username);
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry) return { allowed: true };
  if (entry.lockUntil && entry.lockUntil > now) {
    return { allowed: false, retryAfterMs: entry.lockUntil - now };
  }
  return { allowed: true };
}

async function verifyPassword(input) {
  const hash = process.env.ADMIN_PASSWORD_HASH || '';
  if (hash) {
    return verifyApiKeyHash(hash, input);
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
