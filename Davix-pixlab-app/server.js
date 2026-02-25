const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const mysql = require('mysql2');
const MySQLStore = require('express-mysql-session')(session);
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');
const { sendError } = require('./utils/errorResponse');
const { attachRequestId } = require('./utils/responseMeta');
const { findCustomerKeyByPlaintext } = require('./utils/customerKeys');
const { query, pool, runMigrations, closePool } = require('./db');
const {
  ensureRequestLogSchema,
  hasRequestLogUniqueIndex,
  getTableColumns,
  tableExists,
  testRequestLogInsert,
} = require('./utils/requestLog');
const { startExpiryWatcher, stopExpiryWatcher } = require('./utils/expiryWatcher');
const { startOrphanCleanup, stopOrphanCleanup } = require('./utils/orphanCleanup');
const { startRetentionCleanup, stopRetentionCleanup } = require('./utils/retentionCleanup');
const { startLedgerReclaim, stopLedgerReclaim } = require('./utils/ledgerReclaim');
const { startLedgerCleanup, stopLedgerCleanup } = require('./utils/ledgerCleanup');
const {
  startSubscriptionEventsCleanup,
  stopSubscriptionEventsCleanup,
} = require('./utils/subscriptionEventsCleanup');
const { logError, logExternal, logInternal, logRuntime, LOG_DIR } = require('./utils/logger');
const { sendAlert } = require('./utils/alerts');
const { randomUUID } = require('crypto');
const { getBodyParserLimit, createTimeoutMiddleware } = require('./utils/limits');
const { ensureTempDir } = require('./utils/uploadLimits');
const {
  parseTrustProxySetting,
  parseBooleanEnv,
  isProduction,
  getAutoRunMigrations,
  getRequestLogSchemaEnsureOnStartup,
  getRequireSignedOutputUrls,
  isDiagnosticsEnabled,
  getLedgerEnabled,
  getLedgerReclaimIntervalMs,
  getLedgerReclaimBatchSize,
  getLedgerCleanupIntervalDays,
  getLedgerRetentionDays,
  getLedgerCleanupBatchSize,
} = require('./utils/config');
const { authorizeBridge, internalMiddleware, diagnosticsInternalMiddleware } = require('./utils/internalAuth');
const { validateEnv } = require('./utils/validateEnv');
const { mountAdmin } = require('./admin/adminRoutes');
const { signedStaticGuard, createSignedStaticHeaders } = require('./utils/signedUrls');
const {
  resolveEndpointKey,
  recordRequest,
  startMetrics,
  stopMetrics,
  getMetricsSnapshot,
  getRangeSeries,
} = require('./utils/metrics');
const {
  renderSnapshotHtml,
  resolveSnapshotBaseUrl,
  generateAlertSnapshot,
  startSnapshotCleanup,
  stopSnapshotCleanup,
} = require('./utils/monitoringSnapshot');
const {
  isEnabled: isSnapshotDebugEnabled,
  log: logSnapshotDebug,
  maskToken,
} = require('./utils/internal/debugSnapshotLogger');
const { startAlertEngine, stopAlertEngine } = require('./utils/alertEngine');
const { redactHeaders, redactObject, redactString } = require('./utils/redaction');

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
const subscriptionEventsCleanupDays = parseInt(process.env.SUBSCRIPTION_EVENTS_CLEANUP_EVERY_DAYS, 10) || 1;
const ledgerEnabled = getLedgerEnabled();
const ledgerReclaimIntervalMs = getLedgerReclaimIntervalMs();
const ledgerReclaimBatchSize = getLedgerReclaimBatchSize();
const ledgerCleanupIntervalDays = getLedgerCleanupIntervalDays();
const ledgerCleanupIntervalMs = ledgerCleanupIntervalDays * 24 * 60 * 60 * 1000;
const ledgerRetentionDays = getLedgerRetentionDays();
const ledgerCleanupBatchSize = getLedgerCleanupBatchSize();
const adminPath = process.env.ADMIN_PATH || 'acp';
const adminPass = process.env.ADMIN_PASS || (!isProduction() ? 'local' : null);
if (!adminPass && isProduction()) {
  console.error('ADMIN_PASS is required in production.');
  logRuntime('admin.pass.missing', { message: 'ADMIN_PASS missing in production.' }, 'error');
  process.exit(1);
}
if (!process.env.ADMIN_PASS && !isProduction()) {
  logRuntime('admin.pass.default_used', { message: 'Using default admin pass in dev.' }, 'warn');
}
const adminBase = `/${adminPath}/${adminPass}`;

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
  console.warn(`[CONFIG][WARN] Environment warnings:\n- ${envWarnings.join('\n- ')}`);
  logRuntime('config.validation_warning', { warnings: envWarnings }, 'warn');
}
if (envErrors.length) {
  console.error(`[CONFIG][ERROR] Environment validation failed:\n- ${envErrors.join('\n- ')}`);
  logRuntime('config.validation_error', { errors: envErrors }, 'error');
  process.exit(1);
}

process.on('unhandledRejection', reason => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  logRuntime('process.unhandledRejection', { message: err.message, name: err.name }, 'error');
});

process.on('uncaughtException', err => {
  logRuntime('process.uncaughtException', { message: err.message, name: err.name }, 'error');
  process.exit(1);
});

const trustProxySetting = parseTrustProxySetting();
if (trustProxySetting === false && process.env.PUBLIC_BASE_URL) {
  app.set('trust proxy', 1);
  logRuntime('config.trust_proxy.auto', { reason: 'PUBLIC_BASE_URL set', trust_proxy: 1 }, 'warn');
} else {
  app.set('trust proxy', trustProxySetting);
}

app.use((req, res, next) => {
  req.requestId = randomUUID();
  if (!res.getHeader('Request-Id')) {
    res.setHeader('Request-Id', req.requestId);
  }
  next();
});

function normalizeIdempotencyHeader(value) {
  if (Array.isArray(value)) {
    return value.length ? value[0] : '';
  }
  return typeof value === 'string' ? value : '';
}

function parseIdempotencyKey(req, res, next) {
  const rawHeader = req.headers['idempotency-key'] ?? req.headers['x-idempotency-key'];
  if (rawHeader === undefined) {
    req.idempotencyKey = null;
    return next();
  }
  const rawValue = normalizeIdempotencyHeader(rawHeader);
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return sendError(res, 400, 'invalid_idempotency_key', 'Idempotency key is required when header is present.', {
      details: {
        allowed: '[A-Za-z0-9._:-]',
        length: '8..128',
      },
    });
  }
  if (trimmed.length < 8 || trimmed.length > 128) {
    return sendError(res, 400, 'invalid_idempotency_key', 'Idempotency key length must be 8..128 characters.', {
      details: {
        length: trimmed.length,
      },
    });
  }
  if (!/^[A-Za-z0-9._:-]+$/.test(trimmed)) {
    return sendError(res, 400, 'invalid_idempotency_key', 'Idempotency key contains invalid characters.', {
      details: {
        allowed: '[A-Za-z0-9._:-]',
      },
    });
  }
  req.idempotencyKey = trimmed;
  if (!res.getHeader('Idempotency-Key')) {
    res.setHeader('Idempotency-Key', trimmed);
  }
  return next();
}

app.use(parseIdempotencyKey);

const requestLogSchemaEnsureOnStartup = getRequestLogSchemaEnsureOnStartup();
const shouldEnsureRequestLogSchemaOnStartup = requestLogSchemaEnsureOnStartup || isProduction();

const REQUIRED_SCHEMA_COLUMNS = {
  usage_monthly: ['reserved_files'],
  request_log: ['request_id'],
  quota_ledger: [
    'api_key_id',
    'period',
    'dedupe_id',
    'reserve_units',
    'finalized_units',
    'status',
    'expires_at',
  ],
};

async function getIndexColumns(tableName) {
  const rows = await query(
    `SELECT index_name, column_name, seq_in_index, non_unique
     FROM information_schema.statistics
     WHERE table_schema = DATABASE()
       AND table_name = ?
     ORDER BY index_name, seq_in_index`,
    [tableName]
  );
  const indexes = new Map();
  for (const row of rows) {
    const entry = indexes.get(row.index_name) || { columns: [], nonUnique: row.non_unique };
    entry.columns.push(row.column_name);
    entry.nonUnique = row.non_unique;
    indexes.set(row.index_name, entry);
  }
  return indexes;
}

async function getSchemaStatus() {
  const missingColumns = [];
  const missingIndexes = [];

  for (const [table, columns] of Object.entries(REQUIRED_SCHEMA_COLUMNS)) {
    const exists = await tableExists(table);
    if (!exists) {
      columns.forEach(column => missingColumns.push(`${table}.${column}`));
      continue;
    }

    const tableColumns = await getTableColumns(table);
    const available = new Set(tableColumns.map(column => column.column_name));
    columns.forEach(column => {
      if (!available.has(column)) {
        missingColumns.push(`${table}.${column}`);
      }
    });
  }

  if (await tableExists('request_log')) {
    const hasUnique = await hasRequestLogUniqueIndex();
    if (!hasUnique) {
      missingIndexes.push('request_log unique index (api_key_id, request_id)');
    }
  }

  if (await tableExists('quota_ledger')) {
    const indexes = await getIndexColumns('quota_ledger');
    let hasUnique = false;
    let hasStatusExpires = false;
    let hasApiKeyIndex = false;
    let hasCreatedAtIndex = false;
    for (const info of indexes.values()) {
      const cols = info.columns;
      if (cols.length === 2 && cols[0] === 'api_key_id' && cols[1] === 'dedupe_id' && info.nonUnique === 0) {
        hasUnique = true;
      }
      if (cols.length === 2 && cols[0] === 'status' && cols[1] === 'expires_at') {
        hasStatusExpires = true;
      }
      if (cols.length === 1 && cols[0] === 'api_key_id') {
        hasApiKeyIndex = true;
      }
      if (cols.length === 1 && cols[0] === 'created_at') {
        hasCreatedAtIndex = true;
      }
    }
    if (!hasUnique) {
      missingIndexes.push('quota_ledger unique index (api_key_id, dedupe_id)');
    }
    if (!hasStatusExpires) {
      missingIndexes.push('quota_ledger index (status, expires_at)');
    }
    if (!hasApiKeyIndex) {
      missingIndexes.push('quota_ledger index (api_key_id)');
    }
    if (!hasCreatedAtIndex) {
      missingIndexes.push('quota_ledger index (created_at)');
    }
  }

  return {
    ok: missingColumns.length === 0 && missingIndexes.length === 0,
    missingColumns,
    missingIndexes,
  };
}

// ---- BASE URL (set PUBLIC_BASE_URL=https://pixlab.davix.dev in Plesk) ----
const baseUrl = process.env.PUBLIC_BASE_URL || process.env.BASE_URL || `http://localhost:${PORT}`;

// ---- PUBLIC + OUTPUT FOLDERS ----
const publicDir = path.join(__dirname, 'public');
const h2iDir = path.join(publicDir, 'h2i');
const imgEditDir = path.join(publicDir, 'img-edit');
const pdfDir = path.join(publicDir, 'pdf');
const toolsDir = path.join(publicDir, 'tools');
const assetsDir = path.join(__dirname, 'assets');
const assetsLogoDir = path.join(assetsDir, 'logo');

// Ensure folders exist
for (const dir of [publicDir, h2iDir, imgEditDir, pdfDir, toolsDir, assetsDir, assetsLogoDir]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const resolvedLogDir = path.resolve(LOG_DIR);
const staticRoots = [assetsDir, h2iDir, imgEditDir, pdfDir, toolsDir].map(dir => path.resolve(dir));
const logDirInsideStatic = staticRoots.find(staticDir => resolvedLogDir.startsWith(`${staticDir}${path.sep}`) || resolvedLogDir === staticDir);
if (logDirInsideStatic) {
  logRuntime('security.misconfig', {
    reason: 'log_dir_inside_static_root',
    log_dir: resolvedLogDir,
    static_root: logDirInsideStatic,
  }, 'error');
  if (isProduction()) {
    throw new Error('Invalid LOG_DIR configuration: log directory must not be under static roots.');
  }
}

// Serve saved images/files
const setSignedHeaders = createSignedStaticHeaders();
const requireSignedOutputs = getRequireSignedOutputUrls();
app.use('/assets', express.static(path.join(__dirname, 'assets'), { maxAge: '7d' }));
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

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin && allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Vary', 'Origin'); // so caches don’t mix origins
  }

  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header(
    'Access-Control-Allow-Headers',
    'Content-Type, X-Requested-With, X-Api-Key, x-api-key, Authorization, x-davix-bridge-token, Idempotency-Key, X-Idempotency-Key'
  );
  const existingExposed = res.getHeader('Access-Control-Expose-Headers');
  const exposeList = [];
  if (existingExposed) {
    const normalized = Array.isArray(existingExposed) ? existingExposed.join(',') : String(existingExposed);
    exposeList.push(...normalized.split(','));
  }
  exposeList.push('Request-Id');
  exposeList.push('Idempotency-Key');
  const uniqueExpose = Array.from(new Set(exposeList.map(value => value.trim()).filter(Boolean)));
  res.header('Access-Control-Expose-Headers', uniqueExpose.join(', '));

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
app.use(cookieParser());

const adminSessionSecret = process.env.ADMIN_SESSION_SECRET;
if (!adminSessionSecret) {
  console.error('ADMIN_SESSION_SECRET is required.');
  logRuntime('admin.session_secret.missing', { message: 'ADMIN_SESSION_SECRET missing.' }, 'error');
  process.exit(1);
}
app.set('adminSessionSecret', adminSessionSecret);
app.set('adminSessionCookieName', 'pixlab_admin');
const adminSessionStorePool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'pixlab',
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
  timezone: 'Z',
});
const adminSessionStore = new MySQLStore({
  schema: {
    tableName: 'admin_sessions',
  },
  expiration: 2 * 60 * 60 * 1000,
}, adminSessionStorePool);
app.use(
  session({
    name: 'pixlab_admin',
    secret: adminSessionSecret,
    store: adminSessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: 'auto',
      maxAge: 2 * 60 * 60 * 1000,
    },
  })
);

app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on('finish', () => {
    const durationMs = Date.now() - startedAt;
    const bytesIn = parseInt(req.headers['content-length'], 10) || 0;
    const bytesOut = parseInt(res.getHeader('content-length'), 10) || 0;
    const logData = {
      request_id: req.requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration_ms: durationMs,
      bytes_in: bytesIn,
      bytes_out: bytesOut,
      ip: req.ip,
      user_agent: req.headers['user-agent'] || null,
    };
    if (req.path.startsWith('/internal/')) {
      logInternal('request', { ...logData, bridge_authorized: authorizeBridge(req) });
    } else if (req.path.startsWith('/v1/')) {
      logExternal('request', logData);
    }
    const endpointKey = resolveEndpointKey(req.path, adminBase);
    recordRequest({ endpoint: endpointKey, durationMs, statusCode: res.statusCode });
  });
  next();
});

// ---- Healthcheck ----
app.get('/health', async (req, res) => {
  try {
    const rows = await query('SELECT 1 AS ok');
    return res.json(
      attachRequestId(req, {
        status: 'ok',
        db: rows?.[0]?.ok === 1 ? 'up' : 'unknown',
      })
    );
  } catch (err) {
    logError('healthcheck.failed', {
      request_id: req.requestId,
      message: err?.message,
      code: err?.code,
    });
    return res.status(503).json(attachRequestId(req, {
      status: 'degraded',
      db: 'down',
      error: 'db_unavailable',
    }));
  }
});

if (isDiagnosticsEnabled()) {
  app.get('/internal/admin/diagnostics/health', ...diagnosticsInternalMiddleware, async (req, res) => {
    try {
      const rows = await query('SELECT 1 AS ok');
      const schemaStatus = await getSchemaStatus();
      return res.json(
        attachRequestId(req, {
          status: 'ok',
          db: rows?.[0]?.ok === 1 ? 'up' : 'unknown',
          db_schema_ok: schemaStatus.ok,
          missing_columns: schemaStatus.missingColumns,
          missing_indexes: schemaStatus.missingIndexes,
        })
      );
    } catch (err) {
      logError('healthcheck.failed', {
        request_id: req.requestId,
        code: err?.code,
        name: err?.name,
      });
      return sendError(res, 500, 'db_unavailable', 'Database is unavailable.', {
        hint: 'Try again later or contact support.',
      });
    }
  });

  app.get('/internal/admin/diagnostics/request-log', ...diagnosticsInternalMiddleware, async (req, res) => {
    try {
      const response = {
        status: 'ok',
      };
      const times = await query('SELECT NOW() AS now, UTC_TIMESTAMP() AS utc_now');
      response.db_time = times[0] || null;

      const exists = await tableExists('request_log');
      response.request_log_exists = !!exists;
      response.request_log_columns = exists ? await getTableColumns('request_log') : [];

      const usageExists = await tableExists('usage_monthly');
      response.usage_monthly_exists = !!usageExists;
      response.usage_monthly_columns = usageExists ? await getTableColumns('usage_monthly') : [];

      response.sample_insert_test = await testRequestLogInsert();

      res.json(attachRequestId(req, response));
    } catch (err) {
      logInternal('diagnostics.request_log.failed', {
        request_id: req.requestId,
        code: err?.code,
        name: err?.name,
      }, 'error');
      return sendError(res, 500, 'diagnostics_failed', 'Diagnostics request failed.', {
        hint: 'Try again later or contact support.',
      });
    }
  });

}

app.get('/internal/admin/monitoring/metrics', ...diagnosticsInternalMiddleware, async (req, res) => {
  res.json(attachRequestId(req, getMetricsSnapshot()));
});

app.get('/internal/admin/monitoring/snapshot-view', ...diagnosticsInternalMiddleware, async (req, res) => {
  const tokenHeader = req.headers['x-davix-bridge-token'];
  const requestId = req.requestId || randomUUID();
  req.requestId = requestId;
  logSnapshotDebug('request.start', {
    request_id: requestId,
    method: req.method,
    path: req.originalUrl,
    rule_id: req.query?.rule_id ? Number(req.query.rule_id) : null,
    ip: req.ip,
    user_agent: req.headers['user-agent'],
    host: req.headers.host,
    forwarded_proto: req.headers['x-forwarded-proto'],
    forwarded_for: req.headers['x-forwarded-for'],
    bridge_authorized: authorizeBridge(req),
    bridge_token_masked: maskToken(tokenHeader),
  });
  const snapshot = getMetricsSnapshot();
  const series = getRangeSeries({
    from: Date.now() - 15 * 60 * 1000,
    to: Date.now(),
    bucketSeconds: 10,
  });
  res.type('text/html').send(renderSnapshotHtml({ snapshot, series }));
  logSnapshotDebug('request.complete', {
    request_id: requestId,
    status: res.statusCode,
    content_type: res.getHeader('content-type'),
  });
});

app.get('/internal/admin/monitoring/snapshot', ...diagnosticsInternalMiddleware, async (req, res) => {
  const ruleId = req.query.rule_id ? Number(req.query.rule_id) : 0;
  const tokenHeader = req.headers['x-davix-bridge-token'];
  const requestId = req.requestId || randomUUID();
  req.requestId = requestId;
  const { baseUrl, source: baseUrlSource } = resolveSnapshotBaseUrl(req);
  logSnapshotDebug('request.start', {
    request_id: requestId,
    method: req.method,
    path: req.originalUrl,
    rule_id: ruleId || null,
    ip: req.ip,
    user_agent: req.headers['user-agent'],
    host: req.headers.host,
    forwarded_proto: req.headers['x-forwarded-proto'],
    forwarded_for: req.headers['x-forwarded-for'],
    bridge_authorized: authorizeBridge(req),
    bridge_token_masked: maskToken(tokenHeader),
  });
  logSnapshotDebug('resolve.base_url', {
    request_id: requestId,
    base_url: baseUrl,
    source: baseUrlSource,
  });
  logSnapshotDebug('rule.lookup', {
    request_id: requestId,
    rule_id: ruleId || null,
    found: false,
    reason: 'no_rule_lookup_in_snapshot_endpoint',
  });
  try {
    const snapshotResult = await generateAlertSnapshot(ruleId || 'manual', { requestId, req, allowDirectFetch: false });
    const buffer = snapshotResult?.buffer;
    if (!buffer || !buffer.length) {
      throw new Error('snapshot_buffer_missing');
    }
    logSnapshotDebug('snapshot.complete', {
      request_id: requestId,
      rule_id: ruleId || null,
      output_path: snapshotResult?.filePath || null,
      bytes: buffer.length,
    });
    res.type(snapshotResult.contentType || 'image/png').send(buffer);
    logSnapshotDebug('request.complete', {
      request_id: requestId,
      status: res.statusCode,
      bytes: buffer.length,
    });
  } catch (err) {
    logSnapshotDebug('request.error', {
      request_id: requestId,
      rule_id: ruleId || null,
      failed_stage: err?.failed_stage || null,
      error_name: err?.name,
      error_message: err?.message,
      error_stack: err?.stack,
    }, 'error');
    sendError(res, 500, 'snapshot_failed', 'Failed to generate snapshot.', {
      details: {
        rule_id: ruleId || null,
        failed_stage: err?.failed_stage || null,
      },
    });
  }
});

app.get('/internal/admin/monitoring/snapshot-debug/ping', ...diagnosticsInternalMiddleware, async (req, res) => {
  const requestId = req.requestId || randomUUID();
  req.requestId = requestId;
  res.json(attachRequestId(req, {
    ok: true,
    snapshot_debug_enabled: isSnapshotDebugEnabled(),
    time: new Date().toISOString(),
    node: process.version,
    has_puppeteer: Boolean(puppeteer),
    puppeteer_version: typeof puppeteer?.version === 'function' ? puppeteer.version() : null,
  }));
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
  if (isProduction()) {
    return headerKey || bearerKey || null;
  }
  const bodyKey = normalizeApiKey(req.body?.api_key);
  const queryKey = normalizeApiKey(req.query?.key);
  return headerKey || bearerKey || bodyKey || queryKey || null;
}

function buildMissingKeyHint() {
  const locations = ['X-Api-Key header', 'Authorization: Bearer <key>', 'api_key body field'];
  if (!isProduction()) locations.push('?key= query (dev only)');
  return `Provide a valid API key via the ${locations.join(', ')}.`;
}

async function checkApiKey(req, res, next) {
  try {
    if (isProduction()) {
      const received = [];
      if (req.body && req.body.api_key !== undefined && req.body.api_key !== null) {
        received.push('body_api_key');
      }
      if (req.query && req.query.key !== undefined && req.query.key !== null) {
        received.push('query_key');
      }
      if (received.length) {
        return sendError(
          res,
          400,
          'api_key_location_not_allowed',
          'API keys must be sent via headers in production.',
          {
            details: {
              allowed: ['x-api-key', 'authorization_bearer'],
              received,
            },
          }
        );
      }
    }

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

    const { key: customerKey, error: customerKeyError, hint, key_id: keyId } = await findCustomerKeyByPlaintext(key);
    if (customerKey) {
      req.apiKey = key;
      req.apiKeyType = 'customer';
      req.customerKey = customerKey;
      return next();
    }

    if (customerKeyError === 'expired') {
      if (keyId) {
        try {
          await pool.execute(
            `UPDATE api_keys
               SET status = ?, subscription_status = ?, updated_at = NOW()
             WHERE id = ?
               AND (status <> ? OR subscription_status <> ?)`,
            ['disabled', 'expired', keyId, 'disabled', 'expired']
          );
        } catch (err) {
          console.error('Expired key self-heal failed:', err);
          logRuntime(
            'api_key.expired_self_heal_failed',
            { message: err.message, code: err.code, keyId },
            'error'
          );
        }
      }
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
    logRuntime('api_key.validation_failed', { message: err.message, code: err.code }, 'error');
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
        logRuntime('cleanup.read_failed', { dir, message: err.message }, 'error');
        continue;
      }

      for (const file of files) {
        const filePath = path.join(dir, file);
        let stats;
        try {
          stats = await fs.promises.stat(filePath);
        } catch (statErr) {
          console.error(`Cleanup stat error for ${filePath}:`, statErr);
          logRuntime('cleanup.stat_failed', { filePath, message: statErr.message }, 'error');
          continue;
        }

        if (now - stats.mtimeMs > DAY_MS) {
          try {
            await fs.promises.unlink(filePath);
          } catch (unlinkErr) {
            console.error(`Cleanup unlink error for ${filePath}:`, unlinkErr);
            logRuntime('cleanup.unlink_failed', { filePath, message: unlinkErr.message }, 'error');
          }
        }
      }
    }
  } catch (err) {
    console.error('Cleanup job failed:', err);
    logRuntime('cleanup.job_failed', { message: err.message }, 'error');
  } finally {
    if (lockAcquired && conn) {
      try {
        await conn.query('SELECT RELEASE_LOCK(?) AS released', [CLEANUP_LOCK_NAME]);
      } catch (err) {
        console.error('Cleanup lock release failed:', err);
        logRuntime('cleanup.lock_release_failed', { message: err.message }, 'error');
      }
    }
    if (conn) conn.release();
  }
}

cleanupOldFiles();
let cleanupInterval = setInterval(() => {
  cleanupOldFiles();
}, DAY_MS);

const tempUploadDir = ensureTempDir();

async function cleanupTempUploads() {
  const now = Date.now();
  let entries;
  try {
    entries = await fs.promises.readdir(tempUploadDir);
  } catch (err) {
    console.error(`Temp cleanup failed to read ${tempUploadDir}:`, err);
    logRuntime('temp_cleanup.read_failed', { dir: tempUploadDir, message: err.message }, 'error');
    return;
  }

  for (const entry of entries) {
    const filePath = path.join(tempUploadDir, entry);
    let stats;
    try {
      stats = await fs.promises.stat(filePath);
    } catch (statErr) {
      console.error(`Temp cleanup stat error for ${filePath}:`, statErr);
      logRuntime('temp_cleanup.stat_failed', { filePath, message: statErr.message }, 'error');
      continue;
    }

    if (now - stats.mtimeMs > DAY_MS) {
      try {
        await fs.promises.unlink(filePath);
      } catch (unlinkErr) {
        console.error(`Temp cleanup unlink error for ${filePath}:`, unlinkErr);
        logRuntime('temp_cleanup.unlink_failed', { filePath, message: unlinkErr.message }, 'error');
      }
    }
  }
}

cleanupTempUploads();
let tempCleanupInterval = setInterval(() => {
  cleanupTempUploads();
}, DAY_MS);

const adminSessionsCleanupEnabled = parseBooleanEnv('ADMIN_SESSIONS_CLEANUP_ENABLED', true);
const adminSessionsCleanupIntervalDays = parseInt(process.env.ADMIN_SESSIONS_CLEANUP_INTERVAL_DAYS, 10) || 1;
const adminSessionsTtlDays = parseInt(process.env.ADMIN_SESSIONS_TTL_DAYS, 10) || 10;
const ADMIN_SESSIONS_CLEANUP_INTERVAL_MS = Math.max(adminSessionsCleanupIntervalDays, 1) * 24 * 60 * 60 * 1000;

async function cleanupAdminSessions() {
  if (!adminSessionsCleanupEnabled) return;
  try {
    const [result] = await pool.execute(
      'DELETE FROM admin_sessions WHERE expires < (UTC_TIMESTAMP() - INTERVAL ? DAY)',
      [adminSessionsTtlDays]
    );
    logRuntime('admin_sessions.cleanup_complete', { deleted: result?.affectedRows || 0 }, 'info');
  } catch (err) {
    console.error('Admin sessions cleanup failed:', err);
    logRuntime('admin_sessions.cleanup_failed', { message: err.message, code: err.code }, 'warn');
  }
}

if (adminSessionsCleanupEnabled) {
  cleanupAdminSessions();
  setInterval(cleanupAdminSessions, ADMIN_SESSIONS_CLEANUP_INTERVAL_MS);
}

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

const adminRouter = express.Router();
mountAdmin(adminRouter);
app.use(adminBase, adminRouter);

app.use((req, res) => {
  sendError(res, 404, 'not_found', 'The requested endpoint does not exist.', {
    hint: 'Check the URL and HTTP method you are using.',
  });
});

function sanitizeHeaders(headers = {}) {
  return redactHeaders(headers || {});
}

function scrubString(value) {
  return redactString(value);
}

function redactSensitive(value, depth = 0) {
  return redactObject(value, depth);
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

  const payload = {
    request_id: req.requestId,
    method: req.method,
    url: req.path,
    status: err.status || err.statusCode || 500,
    headers,
    body: bodyPreview,
    message: err.message,
    code: err.code,
    stack: err.stack,
  };
  logError('api.unhandled_error', payload);
  sendAlert({ channel: 'runtime', level: 'error', event: 'api.unhandled_error', ...payload }).catch(() => {});

  if (res.headersSent) return next(err);
  sendError(res, 500, 'internal_error', 'Something went wrong on the server.', {
    hint: 'If this keeps happening, please contact support.',
  });
});

let server = null;
let shuttingDown = false;

async function closeAdminSessionStorePool() {
  if (!adminSessionStorePool || typeof adminSessionStorePool.end !== 'function') return;
  await new Promise(resolve => adminSessionStorePool.end(() => resolve()));
}

async function startServer() {
  if (getAutoRunMigrations()) {
    try {
      const applied = await runMigrations();
      if (applied.length) {
        console.log(`Applied migrations: ${applied.join(', ')}`);
        logRuntime('migrations.applied', { applied }, 'info');
      } else {
        console.log('No new migrations to apply.');
        logRuntime('migrations.none', {}, 'info');
      }
    } catch (err) {
      console.error('Migration failed during startup:', err);
      logRuntime('migrations.failed', { message: err.message }, 'error');
      process.exit(1);
    }
  }

  if (shouldEnsureRequestLogSchemaOnStartup) {
    try {
      await ensureRequestLogSchema();
    } catch (err) {
      console.error('Initial request_log schema check failed', err);
      logRuntime('request_log.schema_check_failed', { message: err.message, code: err.code }, 'error');
      if (isProduction()) {
        process.exit(1);
      }
    }
  }

  let schemaStatus = { ok: true, missingColumns: [] };
  try {
    schemaStatus = await getSchemaStatus();
    if (!schemaStatus.ok && getAutoRunMigrations()) {
      const applied = await runMigrations();
      if (applied.length) {
        console.log(`Applied migrations: ${applied.join(', ')}`);
        logRuntime('migrations.applied', { applied }, 'info');
      }
      schemaStatus = await getSchemaStatus();
    }
  } catch (err) {
    console.error('Schema check failed during startup:', err);
    logRuntime('db.schema_check_failed', { message: err.message, code: err.code }, 'error');
    schemaStatus = { ok: false, missingColumns: [], missingIndexes: [] };
  }

  if (isProduction() && !schemaStatus.ok) {
    const missingItems = [...schemaStatus.missingColumns, ...(schemaStatus.missingIndexes || [])];
    const missing = missingItems.join(', ') || 'unknown';
    console.error(`Required database schema missing: ${missing}`);
    logRuntime('db.schema_missing', { missing: missingItems }, 'error');
    process.exit(1);
  }

  server = app.listen(PORT, () => {
    console.log(`Davix Pixlab API listening on port ${PORT}`);
    logRuntime('server.started', { port: PORT }, 'info');
  });

  startMetrics();
  startAlertEngine();
  startSnapshotCleanup();

  if (expiryWatcherEnabled) {
    startExpiryWatcher({
      intervalMs: expiryWatcherIntervalMs,
      initialDelayMs: 30 * 1000,
      batchSize: expiryWatcherBatchSize,
    });
  } else {
    console.log('Expiry watcher disabled via EXPIRY_WATCHER_ENABLED');
    logRuntime('expiry_watcher.disabled', {}, 'info');
  }

  if (orphanCleanupEnabled) {
    startOrphanCleanup({
      intervalMs: orphanCleanupIntervalMs,
      initialDelayMs: orphanCleanupInitialDelayMs,
      batchSize: orphanCleanupBatchSize,
    });
  } else {
    console.log('Orphan cleanup disabled via ORPHAN_CLEANUP_ENABLED');
    logRuntime('orphan_cleanup.disabled', {}, 'info');
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
    logRuntime('retention_cleanup.disabled', {}, 'info');
  }

  if (ledgerEnabled) {
    startLedgerReclaim({
      intervalMs: ledgerReclaimIntervalMs,
      initialDelayMs: 30 * 1000,
      batchSize: ledgerReclaimBatchSize,
    });
    startLedgerCleanup({
      intervalMs: ledgerCleanupIntervalMs,
      initialDelayMs: 60 * 1000,
      retentionDays: ledgerRetentionDays,
      batchSize: ledgerCleanupBatchSize,
    });
  } else {
    console.log('Ledger jobs disabled via LEDGER_ENABLED');
    logRuntime('ledger.disabled', {}, 'info');
  }

  startSubscriptionEventsCleanup({
    intervalDays: subscriptionEventsCleanupDays,
    initialDelayMs: 60 * 1000,
  });
}

async function shutdown(signal, err = null) {
  if (shuttingDown) return;
  shuttingDown = true;
  const exitCode = err ? 1 : 0;
  console.error(`${signal} received, shutting down...`);
  logRuntime('server.shutdown', { signal, error: err?.message || null }, 'warn');
  if (err?.stack) {
    console.error(err.stack);
  }
  stopExpiryWatcher();
  stopOrphanCleanup();
  stopRetentionCleanup();
  stopLedgerReclaim();
  stopLedgerCleanup();
  stopSubscriptionEventsCleanup();
  stopAlertEngine();
  stopMetrics();
  stopSnapshotCleanup();
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }

  const finalize = async () => {
    await closeAdminSessionStorePool();
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
