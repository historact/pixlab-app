const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const APP_ROOT = path.resolve(__dirname, '..');
const FALLBACK_ENV_PATH = path.resolve(APP_ROOT, '.env');

function resolveExplicitEnvPath(rawValue) {
  const trimmed = String(rawValue || '').trim();
  if (!trimmed) return null;
  if (path.isAbsolute(trimmed)) return trimmed;
  return path.resolve(APP_ROOT, trimmed);
}

function ensureReadableFile(filePath, errorPrefix) {
  try {
    fs.accessSync(filePath, fs.constants.R_OK);
  } catch (err) {
    throw new Error(`${errorPrefix}: ${filePath}`);
  }
}

function loadEnv() {
  const explicitEnvPath = resolveExplicitEnvPath(process.env.ENV_FILE);

  if (explicitEnvPath) {
    ensureReadableFile(explicitEnvPath, '[env] ENV_FILE was set but file could not be read');
    const result = dotenv.config({ path: explicitEnvPath, override: false });
    if (result.error) {
      throw new Error(`[env] Failed to load ENV_FILE: ${explicitEnvPath}`);
    }
    return {
      source: 'ENV_FILE',
      selectedPath: explicitEnvPath,
      loaded: true,
      fallbackMissing: false,
      message: `[env] Loaded environment from ENV_FILE: ${explicitEnvPath}`,
    };
  }

  if (!fs.existsSync(FALLBACK_ENV_PATH)) {
    return {
      source: 'fallback',
      selectedPath: FALLBACK_ENV_PATH,
      loaded: false,
      fallbackMissing: true,
      message: '[env] ENV_FILE not set and fallback .env not found; using existing process environment',
    };
  }

  ensureReadableFile(FALLBACK_ENV_PATH, '[env] Fallback .env exists but file could not be read');
  const result = dotenv.config({ path: FALLBACK_ENV_PATH, override: false });
  if (result.error) {
    throw new Error(`[env] Failed to load fallback .env: ${FALLBACK_ENV_PATH}`);
  }

  return {
    source: 'fallback',
    selectedPath: FALLBACK_ENV_PATH,
    loaded: true,
    fallbackMissing: false,
    message: `[env] Loaded environment from fallback .env: ${FALLBACK_ENV_PATH}`,
  };
}

const envLoadResult = loadEnv();

module.exports = {
  APP_ROOT,
  FALLBACK_ENV_PATH,
  loadEnv,
  envLoadResult,
};
