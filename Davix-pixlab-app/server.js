const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3005;

// ---- BASE URL (set BASE_URL=https://pixlab.davix.dev in Plesk) ----
const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;

// ---- PUBLIC + OUTPUT FOLDERS ----
const publicDir = path.join(__dirname, 'public');
const h2iDir = path.join(publicDir, 'h2i');
const imgEditDir = path.join(publicDir, 'img-edit');

// Ensure folders exist
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
if (!fs.existsSync(h2iDir)) fs.mkdirSync(h2iDir, { recursive: true });
if (!fs.existsSync(imgEditDir)) fs.mkdirSync(imgEditDir, { recursive: true });

// Serve saved images
app.use('/h2i', express.static(h2iDir));
app.use('/img-edit', express.static(imgEditDir));

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
app.use(bodyParser.json({ limit: '5mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '5mb' }));

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

function checkApiKey(req, res, next) {
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

  if (!key || !allowedKeys.includes(key)) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  req.apiKey = key;
  req.apiKeyType = publicKeySet.has(key) ? 'public' : 'owner';
  next();
}

// ---- Mount routes ----
require('./routes/h2i-route')(app, { checkApiKey, h2iDir, baseUrl });
require('./routes/img-edit-route')(app, { checkApiKey, imgEditDir, baseUrl });

app.listen(PORT, () => {
  console.log(`Davix Pixlab API listening on port ${PORT}`);
});
