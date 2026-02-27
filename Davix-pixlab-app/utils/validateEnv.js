const { getRequireSignedOutputUrls, getSignedUrlConfig, isProduction } = require('./config');

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function isBooleanLike(value) {
  const normalized = String(value).trim().toLowerCase();
  return ['true', 'false', '1', '0'].includes(normalized);
}

function parseIntLike(value) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseFloatLike(value) {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function validateEnv() {
  const errors = [];
  const warnings = [];

  const requireInProduction = [
    { name: 'API_KEYS', note: 'comma-separated list of API keys' },
    { name: 'DB_HOST', note: 'database host' },
    { name: 'DB_USER', note: 'database user' },
    { name: 'DB_NAME', note: 'database name' },
    { name: 'PUBLIC_BASE_URL', note: 'public HTTPS base URL for alerts and snapshots' },
    { name: 'ADMIN_PASS', note: 'admin URL segment' },
    { name: 'ADMIN_PASSWORD_HASH', note: 'hashed admin password' },
    { name: 'ADMIN_TOTP_SECRET', note: 'admin TOTP secret' },
    { name: 'ADMIN_SESSION_SECRET', note: 'session signing secret' },
  ];

  if (isProduction()) {
    for (const item of requireInProduction) {
      if (!hasValue(process.env[item.name])) {
        errors.push(`Missing required ENV: ${item.name}${item.note ? ` (${item.note})` : ''}`);
      }
    }

    if (getRequireSignedOutputUrls()) {
      const { secret } = getSignedUrlConfig();
      if (!secret) {
        errors.push('Missing required ENV: SIGNED_URL_SECRET (required when signed output URLs are enabled)');
      }
    }

    if (!hasValue(process.env.SUBSCRIPTION_BRIDGE_TOKEN)) {
      warnings.push('Missing optional ENV: SUBSCRIPTION_BRIDGE_TOKEN (internal subscription bridge auth)');
    }
  }

  const booleanVars = [
    'ADMIN_AUDIT_LOG_ENABLED',
    'DISABLE_QUERY_API_KEY_IN_PROD',
    'API_KEYS_EXPIRY_WATCHER_ENABLED',
    'H2I_ALLOW_FILE_SCHEME',
    'H2I_BLOCK_PRIVATE_NETWORK',
    'DB_ORPHAN_CLEANUP_ENABLED',
    'PUPPETEER_NO_SANDBOX',
    'RATE_LIMITS_DAILY_RETENTION_ENABLED',
    'BURST_LIMITS_WINDOW_RETENTION_ENABLED',
    'QUOTA_LEDGER_ENABLED',
    'REQUIRE_SIGNED_OUTPUT_URLS',
    'DB_RETENTION_CLEANUP_ENABLED',
    'ALERT_DELIVERIES_RETENTION_ENABLED',
    'ALERT_EVENTS_RETENTION_ENABLED',
    'ADMIN_SESSIONS_RETENTION_ENABLED',
  ];

  for (const name of booleanVars) {
    if (!hasValue(process.env[name])) continue;
    if (!isBooleanLike(process.env[name])) {
      errors.push(`Invalid ENV: ${name} (expected true/false/1/0)`);
    }
  }

  const intVars = [
    { name: 'PORT', min: 1 },
    { name: 'ADMIN_LOGIN_WINDOW_MINUTES', min: 0 },
    { name: 'ADMIN_LOGIN_MAX_ATTEMPTS', min: 0 },
    { name: 'ADMIN_LOGIN_LOCK_MINUTES', min: 0 },
    { name: 'ALERT_EMAIL_PORT', min: 1 },
    { name: 'API_KEYS_EXPIRY_WATCHER_INTERVAL_MS', min: 0 },
    { name: 'API_KEYS_EXPIRY_WATCHER_BATCH_SIZE', min: 1 },
    { name: 'QUOTA_LEDGER_TTL_SECONDS', min: 1 },
    { name: 'QUOTA_LEDGER_RECLAIM_INTERVAL_MS', min: 1 },
    { name: 'QUOTA_LEDGER_RECLAIM_BATCH_SIZE', min: 1 },
    { name: 'QUOTA_LEDGER_CLEANUP_INTERVAL_DAYS', min: 1 },
    { name: 'QUOTA_LEDGER_RETENTION_DAYS', min: 1 },
    { name: 'QUOTA_LEDGER_CLEANUP_BATCH_SIZE', min: 1 },
    { name: 'DB_ORPHAN_CLEANUP_INTERVAL_MS', min: 0 },
    { name: 'DB_ORPHAN_CLEANUP_INITIAL_DELAY_MS', min: 0 },
    { name: 'DB_ORPHAN_CLEANUP_BATCH_SIZE', min: 1 },
    { name: 'DB_RETENTION_CLEANUP_INTERVAL_MS', min: 0 },
    { name: 'DB_RETENTION_CLEANUP_INITIAL_DELAY_MS', min: 0 },
    { name: 'REQUEST_LOG_RETENTION_DAYS', min: 1 },
    { name: 'USAGE_MONTHLY_RETENTION_MONTHS', min: 1 },
    { name: 'REQUEST_LOG_RETENTION_BATCH_SIZE', min: 1 },
    { name: 'USAGE_MONTHLY_RETENTION_BATCH_SIZE', min: 1 },
    { name: 'ALERT_DELIVERIES_RETENTION_DAYS', min: 1 },
    { name: 'ALERT_DELIVERIES_RETENTION_INTERVAL_MS', min: 0 },
    { name: 'ALERT_DELIVERIES_RETENTION_INITIAL_DELAY_MS', min: 0 },
    { name: 'ALERT_DELIVERIES_RETENTION_BATCH_SIZE', min: 1 },
    { name: 'ALERT_EVENTS_RETENTION_DAYS', min: 1 },
    { name: 'ALERT_EVENTS_RETENTION_INTERVAL_MS', min: 0 },
    { name: 'ALERT_EVENTS_RETENTION_INITIAL_DELAY_MS', min: 0 },
    { name: 'ALERT_EVENTS_RETENTION_BATCH_SIZE', min: 1 },
    { name: 'SUBSCRIPTION_EVENTS_CLEANUP_INTERVAL_DAYS', min: 1 },
    { name: 'ADMIN_SESSIONS_RETENTION_INTERVAL_DAYS', min: 1 },
    { name: 'ADMIN_SESSIONS_RETENTION_TTL_DAYS', min: 1 },
    { name: 'PUBLIC_FILE_TTL_HOURS', min: 1 },
    { name: 'PUBLIC_H2I_DAILY_LIMIT', min: 1 },
    { name: 'PUBLIC_IMAGE_DAILY_LIMIT', min: 1 },
    { name: 'PUBLIC_PDF_DAILY_LIMIT', min: 1 },
    { name: 'PUBLIC_TOOLS_DAILY_LIMIT', min: 1 },
    { name: 'PUBLIC_TIMEOUT_MS', min: 1 },
    { name: 'OWNER_TIMEOUT_MS', min: 1 },
    { name: 'PUBLIC_IMAGE_MAX_FILES_PER_REQ', min: 1 },
    { name: 'PUBLIC_IMAGE_MAX_TOTAL_UPLOAD_MB', min: 1 },
    { name: 'PUBLIC_IMAGE_MAX_DIMENSION_PX', min: 1 },
    { name: 'PUBLIC_PDF_MAX_FILES_PER_REQ', min: 1 },
    { name: 'PUBLIC_PDF_MAX_TOTAL_UPLOAD_MB', min: 1 },
    { name: 'PUBLIC_TOOLS_MAX_FILES_PER_REQ', min: 1 },
    { name: 'PUBLIC_TOOLS_MAX_TOTAL_UPLOAD_MB', min: 1 },
    { name: 'PUBLIC_TOOLS_MAX_DIMENSION_PX', min: 1 },
    { name: 'OWNER_IMAGE_MAX_TOTAL_UPLOAD_MB', min: 1 },
    { name: 'OWNER_IMAGE_MAX_DIMENSION_PX', min: 1 },
    { name: 'OWNER_PDF_MAX_TOTAL_UPLOAD_MB', min: 1 },
    { name: 'OWNER_TOOLS_MAX_TOTAL_UPLOAD_MB', min: 1 },
    { name: 'OWNER_TOOLS_MAX_DIMENSION_PX', min: 1 },
    { name: 'OWNER_MAX_FILES_PER_REQ', min: 1 },
    { name: 'MAX_UPLOAD_BYTES', min: 1 },
    { name: 'MAX_HTML_CHARS', min: 1 },
    { name: 'MAX_RENDER_PIXELS', min: 1 },
    { name: 'MAX_RENDER_WIDTH', min: 1 },
    { name: 'MAX_RENDER_HEIGHT', min: 1 },
    { name: 'CUSTOMER_BURST_LIMIT_PER_MIN', min: 0 },
    { name: 'CUSTOMER_BURST_WINDOW_SECONDS', min: 1 },
    { name: 'SIGNED_URL_TTL_SECONDS', min: 1 },
    { name: 'VALID_FROM_GRACE_SECONDS', min: 0 },
    { name: 'RATE_LIMITS_DAILY_RETENTION_DAYS', min: 1 },
    { name: 'BURST_LIMITS_WINDOW_RETENTION_DAYS', min: 1 },
    { name: 'GLOBAL_MAX_FILES_PER_REQ', min: 1 },
  ];

  for (const entry of intVars) {
    if (!hasValue(process.env[entry.name])) continue;
    const parsed = parseIntLike(process.env[entry.name]);
    if (parsed === null) {
      errors.push(`Invalid ENV: ${entry.name} (expected integer)`);
      continue;
    }
    if (entry.min !== undefined && parsed < entry.min) {
      errors.push(`Invalid ENV: ${entry.name} (expected >= ${entry.min})`);
    }
  }

  const floatVars = [
    { name: 'GLOBAL_MAX_TOTAL_UPLOAD_MB', min: 0 },
  ];

  for (const entry of floatVars) {
    if (!hasValue(process.env[entry.name])) continue;
    const parsed = parseFloatLike(process.env[entry.name]);
    if (parsed === null) {
      errors.push(`Invalid ENV: ${entry.name} (expected number)`);
      continue;
    }
    if (entry.min !== undefined && parsed < entry.min) {
      errors.push(`Invalid ENV: ${entry.name} (expected >= ${entry.min})`);
    }
  }

  const enumVars = [
    { name: 'CUSTOMER_BURST_APPLIES_TO', allowed: ['h2i', 'all'] },
    { name: 'RATE_LIMIT_DB_FAILURE_MODE', allowed: ['memory', 'open', 'closed'] },
    { name: 'H2I_DNS_REBINDING_MODE', allowed: ['off', 'strict', 'pin'] },
  ];

  for (const entry of enumVars) {
    if (!hasValue(process.env[entry.name])) continue;
    const normalized = String(process.env[entry.name]).trim().toLowerCase();
    if (!entry.allowed.includes(normalized)) {
      errors.push(`Invalid ENV: ${entry.name} (expected ${entry.allowed.join('|')})`);
    }
  }

  if (hasValue(process.env.TRUST_PROXY)) {
    const raw = String(process.env.TRUST_PROXY).trim().toLowerCase();
    const isBool = ['true', 'false'].includes(raw);
    const isNumber = Number.isFinite(parseInt(raw, 10));
    if (!isBool && !isNumber) {
      errors.push('Invalid ENV: TRUST_PROXY (expected true, false, or integer)');
    }
  }

  return { errors, warnings };
}

module.exports = { validateEnv };
