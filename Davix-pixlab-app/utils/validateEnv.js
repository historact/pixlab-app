const {
  getRequireSignedOutputUrls,
  getSignedUrlConfig,
  isProduction,
  getH2iNetworkConfig,
  getH2iDnsRebindingMode,
  getPuppeteerNoSandbox,
} = require('./config');
const net = require('net');

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


function parseInternalAllowlistEntries(raw) {
  return String(raw || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
}

function validateInternalAllowlistEntries(entries) {
  const errors = [];
  for (const entry of entries) {
    if (entry.includes('/')) {
      const [ipRaw, prefixRaw] = entry.split('/').map(part => part.trim());
      const family = net.isIP(ipRaw);
      if (!family) {
        errors.push(
          `Invalid ENV: INTERNAL_ALLOWED_IPS entry "${entry}" (CIDR base must be valid IPv4/IPv6)`
        );
        continue;
      }
      const prefix = Number.parseInt(prefixRaw, 10);
      const maxPrefix = family === 4 ? 32 : 128;
      if (!Number.isFinite(prefix) || prefix < 0 || prefix > maxPrefix) {
        errors.push(
          `Invalid ENV: INTERNAL_ALLOWED_IPS entry "${entry}" (CIDR prefix must be integer 0-${maxPrefix})`
        );
      }
      continue;
    }

    if (!net.isIP(entry)) {
      errors.push(
        `Invalid ENV: INTERNAL_ALLOWED_IPS entry "${entry}" (expected IPv4/IPv6 or CIDR)`
      );
    }
  }
  return errors;
}

function validateEnv() {
  const errors = [];
  const warnings = [];

  const alwaysRequired = [
    { name: 'ADMIN_PASS', note: 'admin URL segment' },
    { name: 'ADMIN_TOTP_SECRET', note: 'admin TOTP secret' },
    { name: 'ADMIN_SESSION_SECRET', note: 'session signing secret' },
    { name: 'SUBSCRIPTION_BRIDGE_TOKEN', note: 'internal subscription bridge auth' },
  ];

  for (const item of alwaysRequired) {
    if (!hasValue(process.env[item.name])) {
      errors.push(`Missing required ENV: ${item.name}${item.note ? ` (${item.note})` : ''}`);
    }
  }

  if (!hasValue(process.env.ADMIN_PASSWORD_HASH)) {
    errors.push('Missing required ENV: ADMIN_PASSWORD_HASH (bcrypt hash required for admin login)');
  }

  const requireInProduction = [
    { name: 'API_KEYS', note: 'comma-separated list of API keys' },
    { name: 'DB_HOST', note: 'database host' },
    { name: 'DB_USER', note: 'database user' },
    { name: 'DB_NAME', note: 'database name' },
    { name: 'PUBLIC_BASE_URL', note: 'public HTTPS base URL for alerts and snapshots' },
  ];

  const internalAllowlistEntries = parseInternalAllowlistEntries(process.env.INTERNAL_ALLOWED_IPS);
  errors.push(...validateInternalAllowlistEntries(internalAllowlistEntries));
  if (isProduction() && internalAllowlistEntries.length === 0) {
    errors.push('Missing required ENV: INTERNAL_ALLOWED_IPS (production requires non-empty internal IP allowlist)');
  }

  if (isProduction()) {
    for (const item of requireInProduction) {
      if (!hasValue(process.env[item.name])) {
        errors.push(`Missing required ENV: ${item.name}${item.note ? ` (${item.note})` : ''}`);
      }
    }

    const signedUrlsEnabled = getRequireSignedOutputUrls();
    if (!signedUrlsEnabled) {
      errors.push(
        'Unsafe production setting: REQUIRE_SIGNED_OUTPUT_URLS must be true in production to protect output files.'
      );
    }

    const h2iNetworkConfig = getH2iNetworkConfig();
    if (!h2iNetworkConfig.blockPrivateNetwork) {
      errors.push(
        'Unsafe production setting: H2I_BLOCK_PRIVATE_NETWORK must be true to block SSRF access to private networks.'
      );
    }
    if (h2iNetworkConfig.allowFileScheme) {
      errors.push('Unsafe production setting: H2I_ALLOW_FILE_SCHEME must be false in production.');
    }

    const dnsRebindingMode = getH2iDnsRebindingMode();
    if (dnsRebindingMode === 'off') {
      errors.push('Unsafe production setting: H2I_DNS_REBINDING_MODE must be strict or pin in production.');
    }

    if (getPuppeteerNoSandbox()) {
      errors.push('Unsafe production setting: PUPPETEER_NO_SANDBOX must be false in production.');
    }
  }

  const signedUrlsEnabled = getRequireSignedOutputUrls();
  if (signedUrlsEnabled) {
    const { secret, ttlSeconds, algo } = getSignedUrlConfig();
    if (!secret) {
      errors.push('Missing required ENV: SIGNED_URL_SECRET (required when signed output URLs are enabled)');
    }
    if (!hasValue(process.env.SIGNED_URL_TTL_SECONDS)) {
      errors.push('Missing required ENV: SIGNED_URL_TTL_SECONDS (required when signed output URLs are enabled)');
    }
    if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
      errors.push('Invalid ENV: SIGNED_URL_TTL_SECONDS (expected integer >= 1 when signed output URLs are enabled)');
    }
    const allowedSignedAlgos = ['sha256', 'sha384', 'sha512'];
    if (!allowedSignedAlgos.includes(String(algo || '').toLowerCase())) {
      errors.push(`Invalid ENV: SIGNED_URL_ALGO (expected ${allowedSignedAlgos.join('|')})`);
    }
  }

  const booleanVars = [
    'ADMIN_AUDIT_LOG_ENABLED',
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
    { name: 'API_KEYS_EXPIRY_WATCHER_INTERVAL_MS', min: 1000 },
    { name: 'API_KEYS_EXPIRY_WATCHER_BATCH_SIZE', min: 1 },
    { name: 'QUOTA_LEDGER_TTL_SECONDS', min: 1 },
    { name: 'QUOTA_LEDGER_RECLAIM_INTERVAL_MS', min: 1000 },
    { name: 'QUOTA_LEDGER_RECLAIM_BATCH_SIZE', min: 1 },
    { name: 'QUOTA_LEDGER_CLEANUP_INTERVAL_DAYS', min: 1 },
    { name: 'QUOTA_LEDGER_RETENTION_DAYS', min: 1 },
    { name: 'QUOTA_LEDGER_CLEANUP_BATCH_SIZE', min: 1 },
    { name: 'REQUEST_LOG_RETENTION_DAYS', min: 1 },
    { name: 'USAGE_MONTHLY_RETENTION_MONTHS', min: 1 },
    { name: 'ALERT_DELIVERIES_RETENTION_DAYS', min: 1 },
    { name: 'ALERT_DELIVERIES_RETENTION_INTERVAL_MS', min: 1000 },
    { name: 'ALERT_DELIVERIES_RETENTION_INITIAL_DELAY_MS', min: 1000 },
    { name: 'ALERT_DELIVERIES_RETENTION_BATCH_SIZE', min: 1 },
    { name: 'ALERT_EVENTS_RETENTION_DAYS', min: 1 },
    { name: 'ALERT_EVENTS_RETENTION_INTERVAL_MS', min: 1000 },
    { name: 'ALERT_EVENTS_RETENTION_INITIAL_DELAY_MS', min: 1000 },
    { name: 'ALERT_EVENTS_RETENTION_BATCH_SIZE', min: 1 },

    { name: 'H2I_OUTPUT_RETENTION_HOURS', min: 1 },
    { name: 'H2I_OUTPUT_CLEANUP_INTERVAL_MS', min: 1000 },
    { name: 'IMAGE_OUTPUT_RETENTION_HOURS', min: 1 },
    { name: 'IMAGE_OUTPUT_CLEANUP_INTERVAL_MS', min: 1000 },
    { name: 'PDF_OUTPUT_RETENTION_HOURS', min: 1 },
    { name: 'PDF_OUTPUT_CLEANUP_INTERVAL_MS', min: 1000 },
    { name: 'TOOLS_OUTPUT_RETENTION_HOURS', min: 1 },
    { name: 'TOOLS_OUTPUT_CLEANUP_INTERVAL_MS', min: 1000 },
    { name: 'TEMP_UPLOADS_RETENTION_HOURS', min: 1 },
    { name: 'TEMP_UPLOADS_CLEANUP_INTERVAL_MS', min: 1000 },
    { name: 'MONITORING_SNAPSHOTS_RETENTION_HOURS', min: 1 },
    { name: 'MONITORING_SNAPSHOTS_CLEANUP_INTERVAL_MS', min: 1000 },

    { name: 'PUBLIC_H2I_DAILY_LIMIT', min: 1 },
    { name: 'PUBLIC_IMAGE_DAILY_LIMIT', min: 1 },
    { name: 'PUBLIC_PDF_DAILY_LIMIT', min: 1 },
    { name: 'PUBLIC_TOOLS_DAILY_LIMIT', min: 1 },
    { name: 'PUBLIC_H2I_TIMEOUT_MS', min: 1 },
    { name: 'PUBLIC_IMAGE_TIMEOUT_MS', min: 1 },
    { name: 'PUBLIC_PDF_TIMEOUT_MS', min: 1 },
    { name: 'PUBLIC_TOOLS_TIMEOUT_MS', min: 1 },
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
    { name: 'PUBLIC_H2I_MAX_HTML_CHARS', min: 1 },
    { name: 'PUBLIC_H2I_MAX_RENDER_WIDTH', min: 1 },
    { name: 'PUBLIC_H2I_MAX_RENDER_HEIGHT', min: 1 },
    { name: 'PUBLIC_H2I_MAX_RENDER_PIXELS', min: 1 },
    { name: 'PUBLIC_PDF_MAX_PAGES_TO_IMAGES', min: 1 },
    { name: 'PUBLIC_PDF_MAX_PAGES_EXTRACT_IMAGES', min: 1 },
    { name: 'PUBLIC_PDF_MAX_PAGES_SPLIT', min: 1 },
    { name: 'SIGNED_URL_TTL_SECONDS', min: 1 },
    { name: 'VALID_FROM_GRACE_SECONDS', min: 0 },
    { name: 'RATE_LIMITS_DAILY_RETENTION_DAYS', min: 1 },
    { name: 'BURST_LIMITS_WINDOW_RETENTION_DAYS', min: 1 },
    { name: 'GLOBAL_MAX_FILES_PER_REQ', min: 1 },

    { name: 'REQUEST_LOG_CLEANUP_INTERVAL_MS', min: 1000 },
    { name: 'REQUEST_LOG_CLEANUP_INITIAL_DELAY_MS', min: 1000 },
    { name: 'REQUEST_LOG_CLEANUP_BATCH_SIZE', min: 1 },
    { name: 'USAGE_MONTHLY_CLEANUP_INTERVAL_MS', min: 1000 },
    { name: 'USAGE_MONTHLY_CLEANUP_INITIAL_DELAY_MS', min: 1000 },
    { name: 'USAGE_MONTHLY_CLEANUP_BATCH_SIZE', min: 1 },
    { name: 'RATE_LIMITS_DAILY_CLEANUP_INTERVAL_MS', min: 1000 },
    { name: 'RATE_LIMITS_DAILY_CLEANUP_INITIAL_DELAY_MS', min: 1000 },
    { name: 'RATE_LIMITS_DAILY_CLEANUP_BATCH_SIZE', min: 1 },
    { name: 'BURST_LIMITS_WINDOW_CLEANUP_INTERVAL_MS', min: 1000 },
    { name: 'BURST_LIMITS_WINDOW_CLEANUP_INITIAL_DELAY_MS', min: 1000 },
    { name: 'BURST_LIMITS_WINDOW_CLEANUP_BATCH_SIZE', min: 1 },
    { name: 'INTERNAL_RATE_LIMIT_WINDOWS_RETENTION_DAYS', min: 1 },
    { name: 'INTERNAL_RATE_LIMIT_WINDOWS_CLEANUP_INTERVAL_MS', min: 1000 },
    { name: 'INTERNAL_RATE_LIMIT_WINDOWS_CLEANUP_INITIAL_DELAY_MS', min: 1000 },
    { name: 'INTERNAL_RATE_LIMIT_WINDOWS_CLEANUP_BATCH_SIZE', min: 1 },
    { name: 'ADMIN_LOGIN_LOCKOUTS_RETENTION_DAYS', min: 1 },
    { name: 'ADMIN_LOGIN_LOCKOUTS_CLEANUP_INTERVAL_MS', min: 1000 },
    { name: 'ADMIN_LOGIN_LOCKOUTS_CLEANUP_INITIAL_DELAY_MS', min: 1000 },
    { name: 'ADMIN_LOGIN_LOCKOUTS_CLEANUP_BATCH_SIZE', min: 1 },
    { name: 'REQUEST_LOG_ORPHAN_CLEANUP_INTERVAL_MS', min: 1000 },
    { name: 'REQUEST_LOG_ORPHAN_CLEANUP_INITIAL_DELAY_MS', min: 1000 },
    { name: 'REQUEST_LOG_ORPHAN_CLEANUP_BATCH_SIZE', min: 1 },
    { name: 'USAGE_MONTHLY_ORPHAN_CLEANUP_INTERVAL_MS', min: 1000 },
    { name: 'USAGE_MONTHLY_ORPHAN_CLEANUP_INITIAL_DELAY_MS', min: 1000 },
    { name: 'USAGE_MONTHLY_ORPHAN_CLEANUP_BATCH_SIZE', min: 1 },
    { name: 'SUBSCRIPTION_EVENTS_RETENTION_DAYS', min: 1 },
    { name: 'SUBSCRIPTION_EVENTS_CLEANUP_INTERVAL_MS', min: 1000 },
    { name: 'SUBSCRIPTION_EVENTS_CLEANUP_INITIAL_DELAY_MS', min: 1000 },
    { name: 'SUBSCRIPTION_EVENTS_CLEANUP_BATCH_SIZE', min: 1 },
    { name: 'ADMIN_SESSIONS_RETENTION_DAYS', min: 1 },
    { name: 'ADMIN_SESSIONS_CLEANUP_INTERVAL_MS', min: 1000 },
    { name: 'ADMIN_SESSIONS_CLEANUP_BATCH_SIZE', min: 1 },

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
