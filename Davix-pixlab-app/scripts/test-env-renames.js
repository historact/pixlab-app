const assert = require('assert');
const path = require('path');
const { execSync } = require('child_process');

function withFreshConfig(env, fn) {
  const previous = {};
  for (const key of Object.keys(env)) {
    previous[key] = process.env[key];
    if (env[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = String(env[key]);
    }
  }
  const configPath = path.join(__dirname, '..', 'utils', 'config.js');
  delete require.cache[require.resolve(configPath)];
  const config = require(configPath);
  try {
    fn(config);
  } finally {
    for (const key of Object.keys(env)) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
    delete require.cache[require.resolve(configPath)];
  }
}

withFreshConfig(
  {
    QUOTA_LEDGER_ENABLED: undefined,
    QUOTA_LEDGER_TTL_SECONDS: undefined,
    QUOTA_LEDGER_RECLAIM_INTERVAL_MS: undefined,
    QUOTA_LEDGER_RECLAIM_BATCH_SIZE: undefined,
    QUOTA_LEDGER_CLEANUP_INTERVAL_DAYS: undefined,
    QUOTA_LEDGER_RETENTION_DAYS: undefined,
    QUOTA_LEDGER_CLEANUP_BATCH_SIZE: undefined,
    RATE_LIMITS_SHARED_RETENTION_DAYS: undefined,
    RATE_LIMITS_DAILY_RETENTION_DAYS: undefined,
    BURST_LIMITS_WINDOW_RETENTION_DAYS: undefined,
  },
  config => {
    assert.strictEqual(config.getLedgerEnabled(), true);
    assert.strictEqual(config.getLedgerTtlSeconds(), 86400);
    assert.strictEqual(config.getLedgerReclaimIntervalMs(), 10 * 60 * 1000);
    assert.strictEqual(config.getLedgerReclaimBatchSize(), 500);
    assert.strictEqual(config.getLedgerCleanupIntervalDays(), 20);
    assert.strictEqual(config.getLedgerRetentionDays(), 30);
    assert.strictEqual(config.getLedgerCleanupBatchSize(), 5000);
    assert.strictEqual(config.getRateLimitsDailyRetentionDays(), 2);
    assert.strictEqual(config.getBurstLimitsWindowRetentionDays(), 7);
  }
);

withFreshConfig(
  {
    QUOTA_LEDGER_ENABLED: 'false',
    QUOTA_LEDGER_TTL_SECONDS: '1234',
    QUOTA_LEDGER_RECLAIM_INTERVAL_MS: '2345',
    QUOTA_LEDGER_RECLAIM_BATCH_SIZE: '42',
    QUOTA_LEDGER_CLEANUP_INTERVAL_DAYS: '6',
    QUOTA_LEDGER_RETENTION_DAYS: '55',
    QUOTA_LEDGER_CLEANUP_BATCH_SIZE: '1200',
    RATE_LIMITS_SHARED_RETENTION_DAYS: '9',
  },
  config => {
    assert.strictEqual(config.getLedgerEnabled(), false);
    assert.strictEqual(config.getLedgerTtlSeconds(), 1234);
    assert.strictEqual(config.getLedgerReclaimIntervalMs(), 2345);
    assert.strictEqual(config.getLedgerReclaimBatchSize(), 42);
    assert.strictEqual(config.getLedgerCleanupIntervalDays(), 6);
    assert.strictEqual(config.getLedgerRetentionDays(), 55);
    assert.strictEqual(config.getLedgerCleanupBatchSize(), 1200);
    assert.strictEqual(config.getRateLimitsDailyRetentionDays(), 9);
    assert.strictEqual(config.getBurstLimitsWindowRetentionDays(), 9);
  }
);

const oldNames = [
  'EXPIRY_WATCHER_ENABLED',
  'ORPHAN_CLEANUP_ENABLED',
  'RETENTION_CLEANUP_ENABLED',
  'LEDGER_ENABLED',
  'SUBSCRIPTION_EVENTS_CLEANUP_EVERY_DAYS',
  'ADMIN_SESSIONS_CLEANUP_ENABLED',
];

let rgOutput = '';
try {
  const pattern = `\\b(${oldNames.join('|')})\\b`;
  rgOutput = execSync(
    `rg -n '${pattern}' ${path.join(__dirname, '..', 'server.js')} ${path.join(__dirname, '..', 'utils')} ${path.join(
      __dirname,
      '..',
      'usage.js'
    )} --glob '!scripts/test-env-renames.js'`,
    { encoding: 'utf8' }
  ).trim();
} catch (err) {
  rgOutput = String(err.stdout || '').trim();
}

if (rgOutput) {
  console.warn('Found old env names in non-doc files:');
  console.warn(rgOutput);
}

console.log('test-env-renames: OK');
