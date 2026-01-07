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
  if (raw === undefined || raw === null || raw === '') return true;
  const normalized = raw.toString().trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  const asNumber = Number.parseInt(normalized, 10);
  if (Number.isFinite(asNumber)) return asNumber;
  return true;
}

function getRequireSignedOutputUrls() {
  const defaultValue = isProduction() ? true : false;
  return parseBooleanEnv('REQUIRE_SIGNED_OUTPUT_URLS', defaultValue);
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

function getDisableQueryApiKeyInProd() {
  return parseBooleanEnv('DISABLE_QUERY_API_KEY_IN_PROD', true);
}

function getH2iNetworkConfig() {
  return {
    blockPrivateNetwork: parseBooleanEnv('H2I_BLOCK_PRIVATE_NETWORK', true),
    allowFileScheme: parseBooleanEnv('H2I_ALLOW_FILE_SCHEME', false),
  };
}

function getPuppeteerNoSandbox() {
  return parseBooleanEnv('PUPPETEER_NO_SANDBOX', true);
}

function getGlobalUploadCeilings() {
  return {
    maxTotalUploadMb: parseOptionalFloatEnv('GLOBAL_MAX_TOTAL_UPLOAD_MB'),
    maxFilesPerReq: parseOptionalIntEnv('GLOBAL_MAX_FILES_PER_REQ'),
  };
}

function getCustomerBurstConfig() {
  return {
    limitPerMin: parseIntEnv('CUSTOMER_BURST_LIMIT_PER_MIN', 0),
    windowSeconds: parseIntEnv('CUSTOMER_BURST_WINDOW_SECONDS', 60),
  };
}

function normalizeRetentionDays(value, fallback) {
  if (!Number.isFinite(value) || value < 1) return fallback;
  return value;
}

function resolveRateLimitFallback(defaultDays) {
  const shared = parseIntEnv('RETENTION_RATE_LIMIT_DAYS', defaultDays);
  return normalizeRetentionDays(shared, defaultDays);
}

function getRateLimitsDailyCleanupEnabled() {
  return parseBooleanEnv('RATE_LIMITS_DAILY_CLEANUP_ENABLED', true);
}

function getRateLimitsDailyRetentionDays() {
  const fallback = resolveRateLimitFallback(2);
  const raw = parseIntEnv('RATE_LIMITS_DAILY_RETENTION_DAYS', fallback);
  return normalizeRetentionDays(raw, fallback);
}

function getBurstLimitsWindowCleanupEnabled() {
  return parseBooleanEnv('BURST_LIMITS_WINDOW_CLEANUP_ENABLED', true);
}

function getBurstLimitsWindowRetentionDays() {
  const fallback = resolveRateLimitFallback(7);
  const raw = parseIntEnv('BURST_LIMITS_WINDOW_RETENTION_DAYS', fallback);
  return normalizeRetentionDays(raw, fallback);
}

module.exports = {
  isProduction,
  parseBooleanEnv,
  parseIntEnv,
  parseOptionalIntEnv,
  parseOptionalFloatEnv,
  parseTrustProxySetting,
  getSignedUrlConfig,
  getRequireSignedOutputUrls,
  getDisableQueryApiKeyInProd,
  getH2iNetworkConfig,
  getPuppeteerNoSandbox,
  getGlobalUploadCeilings,
  getCustomerBurstConfig,
  getRateLimitsDailyCleanupEnabled,
  getRateLimitsDailyRetentionDays,
  getBurstLimitsWindowCleanupEnabled,
  getBurstLimitsWindowRetentionDays,
};
