const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'logs');
const API_ERROR_LOG = path.join(LOG_DIR, 'api-errors.log');
const API_INFO_LOG = path.join(LOG_DIR, 'api-info.log');

function ensureLogDir() {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  } catch (err) {
    // Swallow errors to avoid crashing the app during log setup
  }
}

function writeLog(filePath, payload) {
  try {
    ensureLogDir();
    const line = `${JSON.stringify(payload)}\n`;
    fs.appendFileSync(filePath, line);
  } catch (err) {
    // Last resort: surface to stderr to avoid silent failures
    // eslint-disable-next-line no-console
    console.error('[DAVIX][logger] failed to write log', err.message);
  }
}

function logError(event, data = {}) {
  const payload = {
    level: 'error',
    event,
    timestamp: new Date().toISOString(),
    ...data,
  };
  writeLog(API_ERROR_LOG, payload);
}

function logInfo(event, data = {}) {
  const payload = {
    level: 'info',
    event,
    timestamp: new Date().toISOString(),
    ...data,
  };
  writeLog(API_INFO_LOG, payload);
}

module.exports = {
  logError,
  logInfo,
  API_ERROR_LOG,
  API_INFO_LOG,
};
