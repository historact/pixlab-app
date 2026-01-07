const { getRequireSignedOutputUrls, getSignedUrlConfig, isProduction } = require('./config');

function validateEnv() {
  const errors = [];
  const warnings = [];

  if (isProduction()) {
    if (!process.env.API_KEYS) errors.push('API_KEYS');
    if (!process.env.DB_HOST) errors.push('DB_HOST');
    if (!process.env.DB_USER) errors.push('DB_USER');
    if (!process.env.DB_NAME) errors.push('DB_NAME');

    if (getRequireSignedOutputUrls()) {
      const { secret } = getSignedUrlConfig();
      if (!secret) errors.push('SIGNED_URL_SECRET');
    }

    if (!process.env.SUBSCRIPTION_BRIDGE_TOKEN) {
      warnings.push('SUBSCRIPTION_BRIDGE_TOKEN');
    }
  }

  return { errors, warnings };
}

module.exports = { validateEnv };
