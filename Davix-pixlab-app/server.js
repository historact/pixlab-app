const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const { sendError } = require('./utils/errorResponse');
const { query } = require('./db');

const app = express();
const PORT = process.env.PORT || 3005;

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

function normalizeStatus(status) {
  if (status == null) return 'inactive';

  const raw = String(status).trim().toLowerCase();

  if (/^[0-9]+$/.test(raw)) {
    switch (Number(raw)) {
      case 1:
        return 'sold';
      case 2:
        return 'delivered';
      case 3:
        return 'active';
      case 4:
        return 'inactive';
      default:
        return 'inactive';
    }
  }

  switch (raw) {
    case 'sold':
      return 'sold';
    case 'delivered':
      return 'delivered';
    case 'active':
    case 'activated':
      return 'active';
    case 'inactive':
    case 'disabled':
    case 'blocked':
    case 'cancelled':
      return 'inactive';
    default:
      return raw || 'inactive';
  }
}

async function lookupCustomerKey(key) {
  const rows = await query(
    `SELECT ak.id, ak.license_key, ak.status, ak.valid_from, ak.valid_until, ak.plan_id, ak.customer_email, ak.customer_name,
            p.monthly_quota_files AS monthly_quota, p.name AS plan_name
     FROM api_keys ak
     JOIN plans p ON ak.plan_id = p.id
     WHERE ak.license_key = ?
     LIMIT 1`,
    [key]
  );

  if (!rows.length) return null;

  const rec = rows[0];
  const normalizedStatus = normalizeStatus(rec.status);
  rec.status = normalizedStatus;

  if (normalizedStatus !== 'active') return null;
  const now = Date.now();
  if (rec.valid_from && new Date(rec.valid_from).getTime() > now) return null;
  if (rec.valid_until && new Date(rec.valid_until).getTime() < now) return null;
  return rec;
}

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

    const customerKey = await lookupCustomerKey(key);
    if (customerKey) {
      req.apiKey = key;
      req.apiKeyType = 'customer';
      req.customerKey = customerKey;
      return next();
    }

    return sendError(res, 401, 'invalid_api_key', 'Your API key is missing or invalid.', {
      hint: 'Provide a valid API key in the X-Api-Key header or as ?key= in the query.',
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
require('./routes/wp-sync-route')(app, { baseUrl });

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

app.listen(PORT, () => {
  console.log(`Davix Pixlab API listening on port ${PORT}`);
});
