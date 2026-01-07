const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const { sendError } = require('./utils/errorResponse');
const { findCustomerKeyByPlaintext } = require('./utils/customerKeys');
const { query, pool, runMigrations, closePool } = require('./db');
const {
  ensureRequestLogSchema,
  getTableColumns,
  tableExists,
  testRequestLogInsert,
} = require('./utils/requestLog');
const { startExpiryWatcher, stopExpiryWatcher } = require('./utils/expiryWatcher');
const { startOrphanCleanup, stopOrphanCleanup } = require('./utils/orphanCleanup');
const { startRetentionCleanup, stopRetentionCleanup } = require('./utils/retentionCleanup');
const { logError } = require('./utils/logger');
const { randomUUID } = require('crypto');
const { getBodyParserLimit, createTimeoutMiddleware } = require('./utils/limits');
const {
  getDisableQueryApiKeyInProd,
  parseTrustProxySetting,
  isProduction,
  getAutoRunMigrations,
  getRequireSignedOutputUrls,
} = require('./utils/config');
const { validateEnv } = require('./utils/validateEnv');
const { signedStaticGuard, createSignedStaticHeaders } = require('./utils/signedUrls');

const app = express();
const PORT = process.env.PORT || 3005;
const expiryWatcherEnabled = process.env.EXPIRY_WATCHER_ENABLED !== 'false';
const expiryWatcherIntervalMs = parseInt(process.env.EXPIRY_WATCHER_INTERVAL_MS, 10) || 10 * 60 * 1000;
const expiryWatcherBatchSize = parseInt(process.env.EXPIRY_WATCHER_BATCH_SIZE, 10) || 500;
const orphanCleanupEnabled = process.env.ORPHAN_CLEANUP_ENABLED !== 'false';
const orphanCleanupIntervalMs = parseInt(process.env.ORPHAN_CLEANUP_INTERVAL_MS, 10) || 24 * 60 * 60 * 1000;
const orphanCleanupBatchSize = parseInt(process.env.ORPHAN_CLEANUP_BATCH, 10) || 5000;
const orphanCleanupInitialDelayMs = parseInt(process.env.ORPHAN_CLEANUP_INITIAL_DELAY_MS, 10) || 5 * 60 * 1000;
const retentionCleanupEnabled = process.env.RETENTION_CLEANUP_ENABLED !== 'false';
const retentionCleanupIntervalMs = parseInt(process.env.RETENTION_CLEANUP_INTERVAL_MS, 10) || 24 * 60 * 60 * 1000;
const retentionCleanupInitialDelayMs = parseInt(process.env.RETENTION_INITIAL_DELAY_MS, 10) || 60 * 1000;
const retentionRequestLogDays = parseInt(process.env.RETENTION_REQUEST_LOG_DAYS, 10) || 60;
const retentionUsageMonthlyMonths = parseInt(process.env.RETENTION_USAGE_MONTHLY_MONTHS, 10) || 6;
const retentionBatchRequestLog = parseInt(process.env.RETENTION_BATCH_REQUEST_LOG, 10) || 20000;
const retentionBatchUsageMonthly = parseInt(process.env.RETENTION_BATCH_USAGE_MONTHLY, 10) || 5000;
const retentionLogPath = process.env.RETENTION_LOG_PATH || null;

function parseCommaList(value) {
  return (value || '')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
}

function parseKeyList(value) {
  return (value || '')
    .split(/[\s,]+/)
    .map(v => v.trim())
    .filter(Boolean);
}

const { errors: envErrors, warnings: envWarnings } = validateEnv();
if (envWarnings.length) {
  console.warn(`[CONFIG][WARN] Missing optional environment variables: ${envWarnings.join(', ')}`);
}
if (envErrors.length) {
  console.error(`[CONFIG][ERROR] Missing required environment variables: ${envErrors.join(', ')}`);
  process.exit(1);
}

app.set('trust proxy', parseTrustProxySetting());

app.use((req, res, next) => {
  req.requestId = req.headers['x-request-id'] || randomUUID();
  next();
});

ensureRequestLogSchema().catch(err => {
  console.error('Initial request_log schema check failed', err);
});

// ---- BASE URL (set BASE_URL=https://pixlab.davix.dev in Plesk) ----
const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;

// ---- PUBLIC + OUTPUT FOLDERS ----
const publicDir = path.join(__dirname, 'public');
const h2iDir = path.join(publicDir, 'h2i');
const imgEditDir = path.join(publicDir, 'img-edit');
const pdfDir = path.join(publicDir, 'pdf');
const toolsDir = path.join(publicDir, 'tools');

// Ensure folders exist
for (const dir of [publicDir, h2iDir, imgEditDir, pdfDir, toolsDir]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Serve saved images/files
const setSignedHeaders = createSignedStaticHeaders();
const requireSignedOutputs = getRequireSignedOutputUrls();
app.use('/h2i', signedStaticGuard(), express.static(h2iDir, { setHeaders: setSignedHeaders }));
app.use('/img-edit', signedStaticGuard(), express.static(imgEditDir, { setHeaders: setSignedHeaders }));
app.use('/pdf', signedStaticGuard(), express.static(pdfDir, { setHeaders: setSignedHeaders }));
if (requireSignedOutputs) {
  app.use('/tools', signedStaticGuard(), express.static(toolsDir, { setHeaders: setSignedHeaders }));
} else {
  app.use('/tools', express.static(toolsDir));
}

// ---- CORS middleware ----
// You can override with env: CORS_ORIGINS="https://h2i.davix.dev,https://davix.dev"
const allowedOrigins = parseCommaList(
  process.env.CORS_ORIGINS || 'https://h2i.davix.dev,https://davix.dev,https://www.davix.dev'
);

function authorizeBridge(req) {
  const bridgeToken = req.headers['x-davix-bridge-token'];
  return (
    process.env.SUBSCRIPTION_BRIDGE_TOKEN &&
    bridgeToken &&
    bridgeToken === process.env.SUBSCRIPTION_BRIDGE_TOKEN
  );
}

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin && allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Vary', 'Origin'); // so caches don’t mix origins
  }

  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
res.header(
  'Access-Control-Allow-Headers',
  'Content-Type, X-Requested-With, X-Api-Key, x-api-key, Authorization'
);

  // Preflight
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
});

// ---- Body parsers ----
const bodyParserLimit = getBodyParserLimit();
app.use(bodyParser.json({ limit: bodyParserLimit }));
app.use(bodyParser.urlencoded({ extended: true, limit: bodyParserLimit }));

// ---- Healthcheck ----
app.get('/health', async (req, res) => {
  try {
    const rows = await query('SELECT 1 AS ok');
    return res.json({ status: 'ok', db: rows?.[0]?.ok === 1 ? 'up' : 'unknown' });
  } catch (err) {
    return res.status(503).json({
      status: 'degraded',
      db: 'error',
      error: err.message,
    });
  }
});

app.get('/internal/admin/diagnostics/request-log', async (req, res) => {
  if (!authorizeBridge(req)) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const response = {
    status: 'ok',
  };

  try {
    const times = await query('SELECT NOW() AS now, UTC_TIMESTAMP() AS utc_now');
    response.db_time = times[0] || null;
  } catch (err) {
    response.db_time_error = { message: err.message, code: err.code };
  }

  try {
    const exists = await tableExists('request_log');
    response.request_log_exists = !!exists;
    response.request_log_columns = exists ? await getTableColumns('request_log') : [];
  } catch (err) {
    response.request_log_exists = false;
    response.request_log_columns = [];
    response.request_log_error = { message: err.message, code: err.code };
  }

  if (response.request_log_exists) {
    try {
      const createRows = await query('SHOW CREATE TABLE request_log');
      response.request_log_create_sql = createRows[0]?.['Create Table'] || null;
    } catch (err) {
      response.request_log_create_sql = null;
      response.request_log_create_sql_error = { message: err.message, code: err.code };
    }
  } else {
    response.request_log_create_sql = null;
  }

  try {
    const usageExists = await tableExists('usage_monthly');
    response.usage_monthly_exists = !!usageExists;
    response.usage_monthly_columns = usageExists ? await getTableColumns('usage_monthly') : [];
  } catch (err) {
    response.usage_monthly_exists = false;
    response.usage_monthly_columns = [];
    response.usage_monthly_error = { message: err.message, code: err.code };
  }

  response.sample_insert_test = await testRequestLogInsert();

  res.json(response);
});

// ---- API key protection ----
// In Plesk env, e.g.:
//   API_KEYS        = OWNER_KEY_123,PUBLIC_KEY_ABC
//   PUBLIC_API_KEYS = PUBLIC_KEY_ABC
const allowedKeys = parseKeyList(process.env.API_KEYS || '');

const publicKeys = parseKeyList(process.env.PUBLIC_API_KEYS || '');

const publicKeySet = new Set(publicKeys);

function extractBearerToken(req) {
  const auth = req.headers.authorization || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function normalizeApiKey(value) {
  return typeof value === 'string' ? value.trim() : value;
}

function resolveApiKey(req) {
  const headerKey = normalizeApiKey(req.headers['x-api-key']);
  const bearerKey = extractBearerToken(req);
  const bodyKey = normalizeApiKey(req.body?.api_key);
  const allowQueryKey = !isProduction() || !getDisableQueryApiKeyInProd();
  const queryKey = allowQueryKey ? normalizeApiKey(req.query?.key) : null;
  return headerKey || bearerKey || bodyKey || queryKey || null;
}

function buildMissingKeyHint() {
  const allowQueryKey = !isProduction() || !getDisableQueryApiKeyInProd();
  const locations = ['X-Api-Key header', 'Authorization: Bearer <key>', 'api_key body field'];
  if (allowQueryKey) locations.push('?key= query (dev only)');
  return `Provide a valid API key via the ${locations.join(', ')}.`;
}

async function checkApiKey(req, res, next) {
  try {
    const key = resolveApiKey(req);

    if (!key) {
      return sendError(res, 401, 'invalid_api_key', 'Your API key is missing or invalid.', {
        hint: buildMissingKeyHint(),
      });
    }

    if (allowedKeys.includes(key)) {
      req.apiKey = key;
      req.apiKeyType = publicKeySet.has(key) ? 'public' : 'owner';
      return next();
    }

    const { key: customerKey, error: customerKeyError, hint } = await findCustomerKeyByPlaintext(key);
    if (customerKey) {
      req.apiKey = key;
      req.apiKeyType = 'customer';
      req.customerKey = customerKey;
      return next();
    }

    if (customerKeyError === 'expired') {
      return sendError(res, 401, 'key_expired', 'Your API key has expired.', {
        hint: hint || 'Key expired.',
      });
    }

    if (customerKeyError === 'not_active_yet') {
      return sendError(res, 401, 'invalid_api_key', 'Your API key is not active yet.', {
        hint: hint || 'Key not active yet.',
      });
    }

    return sendError(res, 401, 'invalid_api_key', 'Your API key is missing or invalid.', {
      hint: hint || buildMissingKeyHint(),
    });
  } catch (err) {
    console.error('API key validation failed:', err);
    return sendError(res, 500, 'internal_error', 'Something went wrong on the server.', {
      hint: 'If this keeps happening, please contact support.',
    });
  }
}

// ---- Timeout middleware (per endpoint) ----
const timeoutMiddlewareFactory = endpoint => createTimeoutMiddleware(endpoint);

// ---- 24h cleanup job ----
const parsedPublicFileTtlHours = parseInt(process.env.PUBLIC_FILE_TTL_HOURS, 10);
const PUBLIC_FILE_TTL_HOURS =
  Number.isNaN(parsedPublicFileTtlHours) || parsedPublicFileTtlHours <= 0
    ? 24
    : parsedPublicFileTtlHours;
const DAY_MS = PUBLIC_FILE_TTL_HOURS * 60 * 60 * 1000;
const CLEANUP_LOCK_NAME = 'pixlab:cleanupOldFiles';

async function cleanupOldFiles() {
  const targets = [h2iDir, imgEditDir, pdfDir, toolsDir];
  const now = Date.now();
  let conn;
  let lockAcquired = false;

  try {
    conn = await pool.getConnection();
    const [lockRows] = await conn.query('SELECT GET_LOCK(?, 0) AS got', [CLEANUP_LOCK_NAME]);
    lockAcquired = lockRows?.[0]?.got === 1;
    if (!lockAcquired) {
      return;
    }

    for (const dir of targets) {
      let files;
      try {
        files = await fs.promises.readdir(dir);
      } catch (err) {
        console.error(`Cleanup failed to read ${dir}:`, err);
        continue;
      }

      for (const file of files) {
        const filePath = path.join(dir, file);
        let stats;
        try {
          stats = await fs.promises.stat(filePath);
        } catch (statErr) {
          console.error(`Cleanup stat error for ${filePath}:`, statErr);
          continue;
        }

        if (now - stats.mtimeMs > DAY_MS) {
          try {
            await fs.promises.unlink(filePath);
          } catch (unlinkErr) {
            console.error(`Cleanup unlink error for ${filePath}:`, unlinkErr);
          }
        }
      }
    }
  } catch (err) {
    console.error('Cleanup job failed:', err);
  } finally {
    if (lockAcquired && conn) {
      try {
        await conn.query('SELECT RELEASE_LOCK(?) AS released', [CLEANUP_LOCK_NAME]);
      } catch (err) {
        console.error('Cleanup lock release failed:', err);
      }
    }
    if (conn) conn.release();
  }
}

cleanupOldFiles();
setInterval(() => {
  cleanupOldFiles();
}, DAY_MS);

// ---- Mount routes ----
require('./routes/h2i-route')(app, {
  checkApiKey,
  h2iDir,
  baseUrl,
  timeoutMiddlewareFactory,
});
require('./routes/image-route')(app, {
  checkApiKey,
  imgEditDir,
  baseUrl,
  timeoutMiddlewareFactory,
});
require('./routes/pdf-route')(app, {
  checkApiKey,
  pdfDir,
  baseUrl,
  timeoutMiddlewareFactory,
});
require('./routes/tools-route')(app, {
  checkApiKey,
  toolsDir,
  baseUrl,
  timeoutMiddlewareFactory,
});
require('./routes/subscription-route')(app, { baseUrl });

app.use((req, res) => {
  sendError(res, 404, 'not_found', 'The requested endpoint does not exist.', {
    hint: 'Check the URL and HTTP method you are using.',
  });
});

function sanitizeHeaders(headers = {}) {
  const sanitized = {};
  const sensitive = [
    'x-api-key',
    'x-davix-bridge-token',
    'authorization',
    'cookie',
    'set-cookie',
  ];

  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    const isPatternSensitive = /(token|key|secret|authorization)/i.test(lower);
    if (sensitive.includes(lower) || isPatternSensitive) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

function isSensitiveKey(key = '') {
  const normalized = key.toLowerCase();
  return (
    normalized === 'api_key' ||
    normalized === 'key' ||
    normalized === 'license_key' ||
    normalized === 'token' ||
    normalized === 'authorization' ||
    normalized === 'x-api-key' ||
    normalized === 'x_davix_bridge_token' ||
    normalized === 'x-davix-bridge-token' ||
    normalized === 'password' ||
    normalized === 'secret'
  );
}

function scrubString(value) {
  if (!value) return value;
  let scrubbed = value;
  scrubbed = scrubbed.replace(
    /(["']?\b(?:api_key|key|license_key|token|authorization|x-api-key|x-davix-bridge-token|x_davix_bridge_token|password|secret)\b["']?\s*[:=]\s*["']?)[^"'\s&}]+/gi,
    '$1[REDACTED]'
  );
  scrubbed = scrubbed.replace(
    /\b(?:api_key|key|license_key|token|authorization|x-api-key|x-davix-bridge-token|x_davix_bridge_token|password|secret)=([^&\s]+)/gi,
    (_match, val) => _match.replace(val, '[REDACTED]')
  );
  return scrubbed;
}

function redactSensitive(value, depth = 0) {
  if (depth > 5) return '[REDACTED]';
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map(item => redactSensitive(item, depth + 1));
  }
  if (typeof value === 'string') return scrubString(value);
  if (typeof value !== 'object') return value;

  const output = {};
  for (const [key, val] of Object.entries(value)) {
    if (isSensitiveKey(key)) {
      output[key] = '[REDACTED]';
    } else {
      output[key] = redactSensitive(val, depth + 1);
    }
  }
  return output;
}

app.use((err, req, res, next) => {
  const headers = sanitizeHeaders(req.headers);

  const shouldRedactBody = req.originalUrl && req.originalUrl.startsWith('/internal/');
  const bodyPreview = shouldRedactBody
    ? '[REDACTED_INTERNAL_BODY]'
    : (() => {
        try {
          if (typeof req.body === 'string') {
            const scrubbed = scrubString(req.body);
            return scrubbed ? scrubbed.slice(0, 2000) : null;
          }
          const sanitizedBody = redactSensitive(req.body || {});
          const raw = JSON.stringify(sanitizedBody);
          return raw ? raw.slice(0, 2000) : null;
        } catch (e) {
          return '[unserializable body]';
        }
      })();

  logError('api.unhandled_error', {
    request_id: req.requestId,
    method: req.method,
    url: req.path,
    status: err.status || err.statusCode || 500,
    headers,
    body: bodyPreview,
    message: err.message,
    code: err.code,
    stack: err.stack,
  });

  if (res.headersSent) return next(err);
  sendError(res, 500, 'internal_error', 'Something went wrong on the server.', {
    hint: 'If this keeps happening, please contact support.',
  });
});

let server = null;
let shuttingDown = false;

async function startServer() {
  if (getAutoRunMigrations()) {
    try {
      const applied = await runMigrations();
      if (applied.length) {
        console.log(`Applied migrations: ${applied.join(', ')}`);
      } else {
        console.log('No new migrations to apply.');
      }
    } catch (err) {
      console.error('Migration failed during startup:', err);
      process.exit(1);
    }
  }

  server = app.listen(PORT, () => {
    console.log(`Davix Pixlab API listening on port ${PORT}`);
  });

  if (expiryWatcherEnabled) {
    startExpiryWatcher({
      intervalMs: expiryWatcherIntervalMs,
      initialDelayMs: 30 * 1000,
      batchSize: expiryWatcherBatchSize,
    });
  } else {
    console.log('Expiry watcher disabled via EXPIRY_WATCHER_ENABLED');
  }

  if (orphanCleanupEnabled) {
    startOrphanCleanup({
      intervalMs: orphanCleanupIntervalMs,
      initialDelayMs: orphanCleanupInitialDelayMs,
      batchSize: orphanCleanupBatchSize,
    });
  } else {
    console.log('Orphan cleanup disabled via ORPHAN_CLEANUP_ENABLED');
  }

  if (retentionCleanupEnabled) {
    startRetentionCleanup({
      intervalMs: retentionCleanupIntervalMs,
      initialDelayMs: retentionCleanupInitialDelayMs,
      requestLogDays: retentionRequestLogDays,
      usageMonthlyMonths: retentionUsageMonthlyMonths,
      batchRequestLog: retentionBatchRequestLog,
      batchUsageMonthly: retentionBatchUsageMonthly,
      logPath: retentionLogPath,
    });
  } else {
    console.log('Retention cleanup disabled via RETENTION_CLEANUP_ENABLED');
  }
}

async function shutdown(signal, err = null) {
  if (shuttingDown) return;
  shuttingDown = true;
  const exitCode = err ? 1 : 0;
  console.error(`${signal} received, shutting down...`);
  if (err?.stack) {
    console.error(err.stack);
  }
  stopExpiryWatcher();
  stopOrphanCleanup();
  stopRetentionCleanup();

  const finalize = async () => {
    await closePool();
    process.exit(exitCode);
  };

  if (server) {
    server.close(() => {
      finalize();
    });
  } else {
    await finalize();
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', err => shutdown('unhandledRejection', err));
process.on('uncaughtException', err => shutdown('uncaughtException', err));

startServer();
