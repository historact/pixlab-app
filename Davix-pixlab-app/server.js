const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const { sendError } = require('./utils/errorResponse');
const { findCustomerKeyByPlaintext } = require('./utils/customerKeys');
const { query } = require('./db');
const {
  ensureRequestLogSchema,
  getTableColumns,
  tableExists,
  testRequestLogInsert,
} = require('./utils/requestLog');
const { startExpiryWatcher, stopExpiryWatcher } = require('./utils/expiryWatcher');
const { startOrphanCleanup, stopOrphanCleanup } = require('./utils/orphanCleanup');
const { startRetentionCleanup, stopRetentionCleanup } = require('./utils/retentionCleanup');

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

app.set('trust proxy', true);

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
app.use('/h2i', express.static(h2iDir));
app.use('/img-edit', express.static(imgEditDir));
app.use('/pdf', express.static(pdfDir));
app.use('/tools', express.static(toolsDir));

// ---- CORS middleware ----
// You can override with env: CORS_ORIGINS="https://h2i.davix.dev,https://davix.dev"
const allowedOrigins = (process.env.CORS_ORIGINS || 'https://h2i.davix.dev,https://davix.dev,https://www.davix.dev')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

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
    'Content-Type, X-Requested-With, X-Api-Key, x-api-key'
  );

  // Preflight
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
});

// ---- Body parsers ----
app.use(bodyParser.json({ limit: '20mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '20mb' }));

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
const allowedKeys = (process.env.API_KEYS || '')
  .split(',')
  .map(k => k.trim())
  .filter(Boolean);

const publicKeys = (process.env.PUBLIC_API_KEYS || '')
  .split(',')
  .map(k => k.trim())
  .filter(Boolean);

const publicKeySet = new Set(publicKeys);

async function checkApiKey(req, res, next) {
  try {
    // If no keys configured → allow all as "owner" (unlimited)
    if (!allowedKeys.length) {
      req.apiKey = null;
      req.apiKeyType = 'owner';
      return next();
    }

    const key =
      req.query.key ||
      req.headers['x-api-key'] ||
      req.body.api_key;

    if (!key) {
      return sendError(res, 401, 'invalid_api_key', 'Your API key is missing or invalid.', {
        hint: 'Provide a valid API key in the X-Api-Key header or as ?key= in the query.',
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
      hint: hint || 'Provide a valid API key in the X-Api-Key header or as ?key= in the query.',
    });
  } catch (err) {
    console.error('API key validation failed:', err);
    return sendError(res, 500, 'internal_error', 'Something went wrong on the server.', {
      hint: 'If this keeps happening, please contact support.',
    });
  }
}

// ---- Timeout middleware (public keys) ----
function publicTimeoutMiddleware(req, res, next) {
  const isPublic = req.apiKeyType === 'public';
  const timeoutMs = isPublic ? 30_000 : 5 * 60_000;

  let timer = setTimeout(() => {
    if (!res.headersSent) {
      sendError(res, 503, 'timeout', 'The request took too long to complete.', {
        hint: 'Try again with a smaller payload or fewer operations.',
      });
    }
  }, timeoutMs);

  const clear = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  res.on('finish', clear);
  res.on('close', clear);
  res.on('error', clear);

  next();
}

// ---- 24h cleanup job ----
const DAY_MS = 24 * 60 * 60 * 1000;
function cleanupOldFiles() {
  const targets = [h2iDir, imgEditDir, pdfDir, toolsDir];
  const now = Date.now();

  for (const dir of targets) {
    fs.readdir(dir, (err, files) => {
      if (err) return console.error(`Cleanup failed to read ${dir}:`, err);

      files.forEach(file => {
        const filePath = path.join(dir, file);
        fs.stat(filePath, (statErr, stats) => {
          if (statErr) {
            console.error(`Cleanup stat error for ${filePath}:`, statErr);
            return;
          }

          if (now - stats.mtimeMs > DAY_MS) {
            fs.unlink(filePath, unlinkErr => {
              if (unlinkErr) {
                console.error(`Cleanup unlink error for ${filePath}:`, unlinkErr);
              }
            });
          }
        });
      });
    });
  }
}

cleanupOldFiles();
setInterval(cleanupOldFiles, DAY_MS);

// ---- Mount routes ----
require('./routes/h2i-route')(app, {
  checkApiKey,
  h2iDir,
  baseUrl,
  publicTimeoutMiddleware,
});
require('./routes/image-route')(app, {
  checkApiKey,
  imgEditDir,
  baseUrl,
  publicTimeoutMiddleware,
});
require('./routes/pdf-route')(app, {
  checkApiKey,
  pdfDir,
  baseUrl,
  publicTimeoutMiddleware,
});
require('./routes/tools-route')(app, {
  checkApiKey,
  toolsDir,
  baseUrl,
  publicTimeoutMiddleware,
});
require('./routes/subscription-route')(app, { baseUrl });

app.use((req, res) => {
  sendError(res, 404, 'not_found', 'The requested endpoint does not exist.', {
    hint: 'Check the URL and HTTP method you are using.',
  });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  if (res.headersSent) return next(err);
  sendError(res, 500, 'internal_error', 'Something went wrong on the server.', {
    hint: 'If this keeps happening, please contact support.',
    details: err,
  });
});

const server = app.listen(PORT, () => {
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

function shutdown(signal) {
  console.log(`${signal} received, shutting down...`);
  stopExpiryWatcher();
  stopOrphanCleanup();
  stopRetentionCleanup();
  server.close(() => {
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
