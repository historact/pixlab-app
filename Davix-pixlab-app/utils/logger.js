const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseBooleanEnv } = require('./config');

const DEFAULT_LOG_DIR = path.join(__dirname, '..', 'var', 'logs');
const CWD_FALLBACK_LOG_DIR = path.join(process.cwd(), 'var', 'logs');
const TMP_FALLBACK_LOG_DIR = path.join(os.tmpdir(), 'pixlab-logs');

function tryEnsureLogDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    return null;
  } catch (err) {
    return err;
  }
}

function resolveLogDir() {
  const envDir = (process.env.PIXLAB_LOG_DIR || '').trim();
  const candidates = [envDir, DEFAULT_LOG_DIR, CWD_FALLBACK_LOG_DIR, TMP_FALLBACK_LOG_DIR].filter(Boolean);
  const errors = [];
  for (const candidate of candidates) {
    const err = tryEnsureLogDir(candidate);
    if (!err) {
      const usedFallback = envDir && candidate !== envDir;
      return {
        dir: candidate,
        warning: usedFallback
          ? { reason: 'env_log_dir_unavailable', env_dir: envDir, selected: candidate }
          : null,
      };
    }
    errors.push({ dir: candidate, message: err.message });
  }
  return {
    dir: DEFAULT_LOG_DIR,
    warning: {
      reason: 'log_dir_unavailable',
      env_dir: envDir || null,
      selected: DEFAULT_LOG_DIR,
      attempts: errors,
    },
  };
}

const { dir: LOG_DIR, warning: LOG_DIR_WARNING } = resolveLogDir();
const SETTINGS_PATH = path.join(LOG_DIR, 'admin-settings.json');

const CHANNELS = ['external', 'internal', 'runtime', 'audit'];
const LEVELS = ['debug', 'info', 'warn', 'error'];
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_RETENTION_DAYS = 7;
const DEFAULT_AUDIT_RETENTION_DAYS = 30;
const DEFAULT_EMAIL_SUBJECT_TEMPLATE =
  '[PixLab] {state} {severity} {rule_name} (rule:{rule_id}) @ {time}';

const defaultSettings = {
  channels: {
    external: {
      enabled: true,
      level: 'info',
      max_bytes: DEFAULT_MAX_BYTES,
      retention_days: DEFAULT_RETENTION_DAYS,
    },
    internal: {
      enabled: true,
      level: 'info',
      max_bytes: DEFAULT_MAX_BYTES,
      retention_days: DEFAULT_RETENTION_DAYS,
    },
    runtime: {
      enabled: true,
      level: 'info',
      max_bytes: DEFAULT_MAX_BYTES,
      retention_days: DEFAULT_RETENTION_DAYS,
    },
    audit: {
      level: 'info',
      max_bytes: DEFAULT_MAX_BYTES,
      retention_days: DEFAULT_AUDIT_RETENTION_DAYS,
    },
  },
  subscriptionEvents: {
    enabled: true,
    retentionDays: 30,
  },
  alerts: {
    email: {
      enabled: false,
      recipients: [],
      subject_template: DEFAULT_EMAIL_SUBJECT_TEMPLATE,
      template:
        '[{time}] {level} {channel} {event} {message} request_id={request_id} status={status} method={method} path={path}',
    },
    telegram: {
      enabled: false,
      targets: [],
      photo_caption_template: '',
      template:
        '[{time}] {level} {channel} {event} {message} request_id={request_id} status={status} method={method} path={path}',
    },
    cooldown_seconds: 300,
  },
};

const writeQueues = new Map();
let cachedSettings = null;
let settingsLoadedAt = 0;
const SETTINGS_CACHE_MS = 1000;

function ensureLogDir() {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  } catch (err) {
    // ignore - log dir fallback handled in resolveLogDir
  }
}

function normalizeLevel(level) {
  return LEVELS.includes(level) ? level : 'info';
}

function levelValue(level) {
  return LEVELS.indexOf(level);
}

function isChannelEnabled(channel, settings) {
  if (channel === 'audit') {
    return parseBooleanEnv('ADMIN_AUDIT_LOG_ENABLED', true);
  }
  return Boolean(settings.channels?.[channel]?.enabled);
}

function getChannelPath(channel) {
  return path.join(LOG_DIR, `${channel}.log`);
}

function getRotatedPattern(channel) {
  return new RegExp(`^${channel}\\.(\\d{8}T\\d{6}Z)\\.log$`);
}

function currentTimestamp() {
  const now = new Date();
  const pad = value => String(value).padStart(2, '0');
  return (
    `${now.getUTCFullYear()}` +
    `${pad(now.getUTCMonth() + 1)}` +
    `${pad(now.getUTCDate())}` +
    `T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`
  );
}

function sanitizeHeaders(headers = {}) {
  const sanitized = {};
  const sensitive = ['x-api-key', 'x-davix-bridge-token', 'authorization', 'cookie', 'set-cookie'];

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

function sanitizeData(data = {}) {
  const sanitized = {};
  for (const [key, value] of Object.entries(data || {})) {
    if (key === 'headers') {
      sanitized.headers = sanitizeHeaders(value || {});
      continue;
    }
    sanitized[key] = redactSensitive(value);
  }
  return sanitized;
}

function loadSettings() {
  ensureLogDir();
  if (cachedSettings && Date.now() - settingsLoadedAt < SETTINGS_CACHE_MS) return cachedSettings;
  let settings = defaultSettings;
  if (fs.existsSync(SETTINGS_PATH)) {
    try {
      const raw = fs.readFileSync(SETTINGS_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      settings = {
        ...defaultSettings,
        ...parsed,
        channels: {
          ...defaultSettings.channels,
          ...(parsed.channels || {}),
        },
        subscriptionEvents: {
          ...defaultSettings.subscriptionEvents,
          ...(parsed.subscriptionEvents || {}),
        },
        alerts: {
          ...defaultSettings.alerts,
          ...(parsed.alerts || {}),
          email: {
            ...defaultSettings.alerts.email,
            ...(parsed.alerts?.email || {}),
          },
          telegram: {
            ...defaultSettings.alerts.telegram,
            ...(parsed.alerts?.telegram || {}),
          },
        },
      };
    } catch (err) {
      settings = defaultSettings;
    }
  }
  const configuredChannels = settings.channels || {};
  const hasExtraChannels = Object.keys(configuredChannels).some(channel => !CHANNELS.includes(channel));
  settings.channels = CHANNELS.reduce((acc, channel) => {
    if (settings.channels?.[channel]) acc[channel] = settings.channels[channel];
    return acc;
  }, {});
  if (hasExtraChannels) {
    persistSettings(settings);
  }
  cachedSettings = settings;
  settingsLoadedAt = Date.now();
  return settings;
}

function persistSettings(settings) {
  ensureLogDir();
  fs.writeFileSync(SETTINGS_PATH, `${JSON.stringify(settings, null, 2)}\n`);
  cachedSettings = settings;
  settingsLoadedAt = Date.now();
}

function getSettings() {
  const settings = loadSettings();
  if (!parseBooleanEnv('ADMIN_AUDIT_LOG_ENABLED', true)) {
    deleteChannelLogs('audit');
  }
  return {
    ...settings,
    channels: {
      ...settings.channels,
      audit: {
        ...settings.channels.audit,
        enabled: parseBooleanEnv('ADMIN_AUDIT_LOG_ENABLED', true),
      },
    },
  };
}

function getSubscriptionEventSettings() {
  const settings = loadSettings();
  return settings.subscriptionEvents || defaultSettings.subscriptionEvents;
}

function updateSubscriptionEventSettings(next = {}) {
  const settings = loadSettings();
  const normalized = {
    enabled: typeof next.enabled === 'boolean' ? next.enabled : Boolean(settings.subscriptionEvents?.enabled),
    retentionDays:
      Number(next.retentionDays) ||
      settings.subscriptionEvents?.retentionDays ||
      defaultSettings.subscriptionEvents.retentionDays,
  };
  const updated = {
    ...settings,
    subscriptionEvents: normalized,
  };
  persistSettings(updated);
  return updated.subscriptionEvents;
}

function updateChannelSettings(channel, next = {}) {
  if (!CHANNELS.includes(channel)) return getSettings();
  const settings = loadSettings();
  if (channel === 'audit') {
    settings.channels.audit = {
      ...settings.channels.audit,
      level: normalizeLevel(next.level || settings.channels.audit.level),
      max_bytes: Number(next.max_bytes) || settings.channels.audit.max_bytes,
      retention_days: Number(next.retention_days) || settings.channels.audit.retention_days,
    };
  } else {
    settings.channels[channel] = {
      ...settings.channels[channel],
      enabled: typeof next.enabled === 'boolean' ? next.enabled : settings.channels[channel].enabled,
      level: normalizeLevel(next.level || settings.channels[channel].level),
      max_bytes: Number(next.max_bytes) || settings.channels[channel].max_bytes,
      retention_days: Number(next.retention_days) || settings.channels[channel].retention_days,
    };
  }
  persistSettings(settings);
  // Do not delete logs when disabling; clearing must be explicit via the Clear action.
  return getSettings();
}

function updateAlertSettings(next = {}) {
  const settings = loadSettings();
  settings.alerts = {
    ...settings.alerts,
    ...next,
    email: {
      ...settings.alerts.email,
      ...(next.email || {}),
    },
    telegram: {
      ...settings.alerts.telegram,
      ...(next.telegram || {}),
    },
  };
  persistSettings(settings);
  return getSettings();
}

function deleteChannelLogs(channel) {
  ensureLogDir();
  const files = fs.readdirSync(LOG_DIR);
  const pattern = getRotatedPattern(channel);
  for (const file of files) {
    if (file === `${channel}.log` || pattern.test(file)) {
      try {
        fs.unlinkSync(path.join(LOG_DIR, file));
      } catch (err) {
        // ignore
      }
    }
  }
}

function rotateIfNeeded(channel, maxBytes) {
  const filePath = getChannelPath(channel);
  if (!fs.existsSync(filePath)) return;
  const stats = fs.statSync(filePath);
  if (stats.size < maxBytes) return;
  const rotatedName = `${channel}.${currentTimestamp()}.log`;
  fs.renameSync(filePath, path.join(LOG_DIR, rotatedName));
}

function cleanupRotated(channel, retentionDays) {
  if (!retentionDays || retentionDays <= 0) return;
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const pattern = getRotatedPattern(channel);
  const files = fs.readdirSync(LOG_DIR);
  for (const file of files) {
    if (!pattern.test(file)) continue;
    const filePath = path.join(LOG_DIR, file);
    try {
      const stats = fs.statSync(filePath);
      if (stats.mtimeMs < cutoff) fs.unlinkSync(filePath);
    } catch (err) {
      // ignore
    }
  }
}

async function writeLine(channel, line, settings) {
  ensureLogDir();
  if (channel === 'audit' && !parseBooleanEnv('ADMIN_AUDIT_LOG_ENABLED', true)) {
    deleteChannelLogs('audit');
    return;
  }
  const channelSettings = settings.channels[channel] || settings.channels.runtime;
  const maxBytes = Number(channelSettings.max_bytes) || DEFAULT_MAX_BYTES;
  rotateIfNeeded(channel, maxBytes);
  const filePath = getChannelPath(channel);
  await fs.promises.appendFile(filePath, line);
  cleanupRotated(channel, channelSettings.retention_days || DEFAULT_RETENTION_DAYS);
}

function enqueueWrite(channel, line, settings) {
  const prev = writeQueues.get(channel) || Promise.resolve();
  const next = prev
    .then(() => writeLine(channel, line, settings))
    .catch(() => {
      // ignore
    });
  writeQueues.set(channel, next);
}

function shouldLogLevel(level, threshold) {
  return levelValue(level) >= levelValue(threshold);
}

function buildPayload(channel, level, event, data) {
  const sanitized = sanitizeData(data || {});
  return {
    channel,
    level,
    event,
    timestamp: new Date().toISOString(),
    ...sanitized,
  };
}

function log(channel, level, event, data = {}) {
  const settings = loadSettings();
  if (!CHANNELS.includes(channel)) return;
  if (!isChannelEnabled(channel, settings)) return;
  const channelSettings = settings.channels[channel] || settings.channels.runtime;
  const normalizedLevel = normalizeLevel(level);
  if (!shouldLogLevel(normalizedLevel, normalizeLevel(channelSettings.level))) return;
  const payload = buildPayload(channel, normalizedLevel, event, data);
  const line = `${JSON.stringify(payload)}\n`;
  enqueueWrite(channel, line, settings);
}

async function readLastLines(filePath, maxLines = 200) {
  if (!fs.existsSync(filePath)) return [];
  const handle = await fs.promises.open(filePath, 'r');
  try {
    const stats = await handle.stat();
    let position = stats.size;
    let buffer = '';
    const chunkSize = 64 * 1024;
    while (position > 0 && buffer.split('\n').length <= maxLines + 1) {
      const readSize = Math.min(chunkSize, position);
      position -= readSize;
      const chunk = Buffer.alloc(readSize);
      await handle.read(chunk, 0, readSize, position);
      buffer = `${chunk.toString('utf8')}${buffer}`;
    }
    const lines = buffer.trim().split('\n');
    return lines.slice(-maxLines);
  } finally {
    await handle.close();
  }
}

async function tailChannel(channel, options = {}) {
  if (!CHANNELS.includes(channel)) return [];
  const filePath = getChannelPath(channel);
  const maxLines = Number(options.lines) || 200;
  const lines = await readLastLines(filePath, maxLines);
  const level = options.level ? normalizeLevel(options.level) : null;
  const search = options.search ? options.search.toLowerCase() : null;
  const since = options.since ? new Date(options.since).getTime() : null;
  const until = options.until ? new Date(options.until).getTime() : null;

  const filtered = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch (err) {
      if (level || since || until) continue;
      if (search && !line.toLowerCase().includes(search)) continue;
      filtered.push(line);
      continue;
    }
    if (level && !shouldLogLevel(parsed.level || 'info', level)) continue;
    const timestamp = parsed.timestamp ? new Date(parsed.timestamp).getTime() : null;
    if (since && timestamp && timestamp < since) continue;
    if (until && timestamp && timestamp > until) continue;
    if (search && !JSON.stringify(parsed).toLowerCase().includes(search)) continue;
    filtered.push(parsed);
  }
  return filtered;
}

function getExportFiles(channel) {
  if (!CHANNELS.includes(channel)) return [];
  if (!fs.existsSync(LOG_DIR)) return [];
  const files = fs.readdirSync(LOG_DIR);
  const pattern = getRotatedPattern(channel);
  const matched = files
    .filter(file => file === `${channel}.log` || pattern.test(file))
    .map(file => ({ file, path: path.join(LOG_DIR, file) }))
    .sort((a, b) => {
      try {
        const aStat = fs.statSync(a.path).mtimeMs;
        const bStat = fs.statSync(b.path).mtimeMs;
        return aStat - bStat;
      } catch (err) {
        return 0;
      }
    });
  return matched;
}

function streamExport(channel, res) {
  const files = getExportFiles(channel);
  let index = 0;
  const pipeNext = () => {
    if (index >= files.length) {
      res.end();
      return;
    }
    const stream = fs.createReadStream(files[index].path);
    stream.on('end', () => {
      index += 1;
      pipeNext();
    });
    stream.on('error', () => {
      index += 1;
      pipeNext();
    });
    stream.pipe(res, { end: false });
  };
  pipeNext();
}

function logError(event, data = {}) {
  log('runtime', 'error', event, data);
}

function logInfo(event, data = {}) {
  log('runtime', 'info', event, data);
}

function logExternal(event, data = {}, level = 'info') {
  log('external', level, event, data);
}

function logInternal(event, data = {}, level = 'info') {
  log('internal', level, event, data);
}

function logRuntime(event, data = {}, level = 'info') {
  log('runtime', level, event, data);
}

function logAudit(event, data = {}, level = 'info') {
  log('audit', level, event, data);
}

if (LOG_DIR_WARNING) {
  setImmediate(() => {
    logRuntime('logger.log_dir_fallback', LOG_DIR_WARNING, 'warn');
  });
}

module.exports = {
  logError,
  logInfo,
  logExternal,
  logInternal,
  logRuntime,
  logAudit,
  LOG_DIR,
  getSettings,
  updateChannelSettings,
  updateAlertSettings,
  tailChannel,
  streamExport,
  deleteChannelLogs,
  sanitizeData,
  getSubscriptionEventSettings,
  updateSubscriptionEventSettings,
};
