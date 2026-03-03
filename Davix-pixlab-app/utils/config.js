const DEFAULT_SIGNED_URL_TTL_SECONDS = 24 * 60 * 60;

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

function parseBooleanEnv(name, defaultValue = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === '') return defaultValue;
  if (typeof raw === 'boolean') return raw;
  const normalized = raw.toString().trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;
  return defaultValue;
}

function parseIntEnv(name, fallback) {
  const value = parseInt(process.env[name], 10);
  return Number.isFinite(value) ? value : fallback;
}

function parseOptionalIntEnv(name) {
  const value = parseInt(process.env[name], 10);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

function parseOptionalFloatEnv(name) {
  const value = parseFloat(process.env[name]);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

function parseTrustProxySetting() {
  const raw = process.env.TRUST_PROXY;
  if (raw === undefined || raw === null || raw === '') return false;
  const normalized = raw.toString().trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === '1') return 1;
  if (normalized === 'false' || normalized === '0') return false;
  const asNumber = Number.parseInt(normalized, 10);
  if (Number.isFinite(asNumber) && asNumber > 0) return asNumber;
  return false;
}

function getRequireSignedOutputUrls() {
  if (isProduction()) return true;
  return parseBooleanEnv('REQUIRE_SIGNED_OUTPUT_URLS', false);
}

function getSignedUrlConfig() {
  return {
    requireSignedUrls: getRequireSignedOutputUrls(),
    secret: process.env.SIGNED_URL_SECRET || '',
    ttlSeconds: parseIntEnv('SIGNED_URL_TTL_SECONDS', DEFAULT_SIGNED_URL_TTL_SECONDS),
    algo: process.env.SIGNED_URL_ALGO || 'sha256',
    cacheControl: process.env.OUTPUT_CACHE_CONTROL || 'private, no-store',
  };
}

function getH2iNetworkConfig() {
  return {
    blockPrivateNetwork: parseBooleanEnv('H2I_BLOCK_PRIVATE_NETWORK', true),
    allowFileScheme: parseBooleanEnv('H2I_ALLOW_FILE_SCHEME', false),
  };
}

function getPuppeteerNoSandbox() {
  const isProd = isProduction();
  return parseBooleanEnv('PUPPETEER_NO_SANDBOX', !isProd);
}

function getGlobalUploadCeilings() {
  return {
    maxTotalUploadMb: parseOptionalFloatEnv('GLOBAL_MAX_TOTAL_UPLOAD_MB'),
    maxFilesPerReq: parseOptionalIntEnv('GLOBAL_MAX_FILES_PER_REQ'),
  };
}


function getRateLimitDbFailureMode() {
  const raw = (process.env.RATE_LIMIT_DB_FAILURE_MODE || 'memory').toString().trim().toLowerCase();
  if (raw === 'open' || raw === 'closed') return raw;
  return 'memory';
}

function getRateLimitFailClosed() {
  if (isProduction()) return true;
  return parseBooleanEnv('RATE_LIMIT_FAIL_CLOSED', false);
}

function getRequestLogSchemaEnsureOnStartup() {
  const defaultValue = isProduction() ? false : true;
  return parseBooleanEnv('REQUEST_LOG_SCHEMA_ENSURE_ON_STARTUP', defaultValue);
}

function getAutoRunMigrations() {
  return parseBooleanEnv('AUTO_RUN_MIGRATIONS', true);
}

function parsePositiveIntEnv(name, fallback) {
  const value = parseInt(process.env[name], 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function getH2iConcurrencyConfig() {
  const defaultConcurrency = isProduction() ? 2 : 4;
  return {
    concurrency: parsePositiveIntEnv('H2I_CONCURRENCY', defaultConcurrency),
    waitMs: parsePositiveIntEnv('H2I_CONCURRENCY_WAIT_MS', 2000),
  };
}

function getImageConcurrencyConfig() {
  const defaultConcurrency = isProduction() ? 4 : 6;
  return {
    concurrency: parsePositiveIntEnv('IMAGE_CONCURRENCY', defaultConcurrency),
    waitMs: parsePositiveIntEnv('IMAGE_CONCURRENCY_WAIT_MS', 2000),
  };
}

function getToolsConcurrencyConfig() {
  const defaultConcurrency = isProduction() ? 4 : 6;
  return {
    concurrency: parsePositiveIntEnv('TOOLS_CONCURRENCY', defaultConcurrency),
    waitMs: parsePositiveIntEnv('TOOLS_CONCURRENCY_WAIT_MS', 2000),
  };
}

function isDiagnosticsEnabled() {
  const raw = process.env.ENABLE_DIAGNOSTICS;
  if (raw === undefined || raw === null || raw === '') {
    return !isProduction();
  }
  return raw.toString().trim().toLowerCase() === 'true';
}

function getH2iDnsRebindingMode() {
  const raw = (process.env.H2I_DNS_REBINDING_MODE || '').toString().trim().toLowerCase();
  if (raw === 'off' || raw === 'strict' || raw === 'pin') return raw;
  if (isProduction() && parseBooleanEnv('H2I_BLOCK_PRIVATE_NETWORK', true)) return 'strict';
  return 'off';
}

function normalizeRetentionDays(value, fallback) {
  if (!Number.isFinite(value) || value < 1) return fallback;
  return value;
}

function getRateLimitsDailyCleanupEnabled() {
  return parseBooleanEnv('RATE_LIMITS_DAILY_RETENTION_ENABLED', true);
}

function getRateLimitsDailyRetentionDays() {
  const fallback = 2;
  const raw = parseIntEnv('RATE_LIMITS_DAILY_RETENTION_DAYS', fallback);
  return normalizeRetentionDays(raw, fallback);
}

function getBurstLimitsWindowCleanupEnabled() {
  return parseBooleanEnv('BURST_LIMITS_WINDOW_RETENTION_ENABLED', true);
}

function getBurstLimitsWindowRetentionDays() {
  const fallback = 7;
  const raw = parseIntEnv('BURST_LIMITS_WINDOW_RETENTION_DAYS', fallback);
  return normalizeRetentionDays(raw, fallback);
}

function getLedgerEnabled() {
  const defaultValue = isProduction() ? true : true;
  return parseBooleanEnv('QUOTA_LEDGER_ENABLED', defaultValue);
}

function getLedgerTtlSeconds() {
  return parsePositiveIntEnv('QUOTA_LEDGER_TTL_SECONDS', 24 * 60 * 60);
}

function getLedgerReclaimIntervalMs() {
  return parsePositiveIntEnv('QUOTA_LEDGER_RECLAIM_INTERVAL_MS', 10 * 60 * 1000);
}

function getLedgerReclaimBatchSize() {
  return parsePositiveIntEnv('QUOTA_LEDGER_RECLAIM_BATCH_SIZE', 500);
}

function getLedgerCleanupIntervalDays() {
  return parsePositiveIntEnv('QUOTA_LEDGER_CLEANUP_INTERVAL_DAYS', 20);
}

function getLedgerRetentionDays() {
  return parsePositiveIntEnv('QUOTA_LEDGER_RETENTION_DAYS', 30);
}

function getLedgerCleanupBatchSize() {
  return parsePositiveIntEnv('QUOTA_LEDGER_CLEANUP_BATCH_SIZE', 5000);
}

module.exports = {
  isProduction,
  parseBooleanEnv,
  parseIntEnv,
  parseOptionalIntEnv,
  parseOptionalFloatEnv,
  parsePositiveIntEnv,
  parseTrustProxySetting,
  getSignedUrlConfig,
  getRequireSignedOutputUrls,
  getH2iNetworkConfig,
  getPuppeteerNoSandbox,
  getGlobalUploadCeilings,
  getRateLimitDbFailureMode,
  getRateLimitFailClosed,
  getRequestLogSchemaEnsureOnStartup,
  getAutoRunMigrations,
  getH2iConcurrencyConfig,
  getImageConcurrencyConfig,
  getToolsConcurrencyConfig,
  isDiagnosticsEnabled,
  getH2iDnsRebindingMode,
  getRateLimitsDailyCleanupEnabled,
  getRateLimitsDailyRetentionDays,
  getBurstLimitsWindowCleanupEnabled,
  getBurstLimitsWindowRetentionDays,
  getLedgerEnabled,
  getLedgerTtlSeconds,
  getLedgerReclaimIntervalMs,
  getLedgerReclaimBatchSize,
  getLedgerCleanupIntervalDays,
  getLedgerRetentionDays,
  getLedgerCleanupBatchSize,
};
