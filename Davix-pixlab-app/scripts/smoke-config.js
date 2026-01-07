#!/usr/bin/env node
const {
  getPuppeteerNoSandbox,
  getH2iDnsRebindingMode,
  getRateLimitDbFailureMode,
  getCustomerBurstAppliesTo,
  getAutoRunMigrations,
} = require('../utils/config');

const resolved = {
  PUPPETEER_NO_SANDBOX: getPuppeteerNoSandbox(),
  H2I_DNS_REBINDING_MODE: getH2iDnsRebindingMode(),
  RATE_LIMIT_DB_FAILURE_MODE: getRateLimitDbFailureMode(),
  CUSTOMER_BURST_APPLIES_TO: getCustomerBurstAppliesTo(),
  AUTO_RUN_MIGRATIONS: getAutoRunMigrations(),
};

const allowed = {
  H2I_DNS_REBINDING_MODE: new Set(['off', 'strict', 'pin']),
  RATE_LIMIT_DB_FAILURE_MODE: new Set(['memory', 'open', 'closed']),
  CUSTOMER_BURST_APPLIES_TO: new Set(['h2i', 'all']),
};

let ok = true;
for (const [key, value] of Object.entries(allowed)) {
  if (!value.has(resolved[key])) {
    console.error(`[config] ${key} is invalid: ${resolved[key]}`);
    ok = false;
  }
}

console.log('[config] resolved values:', JSON.stringify(resolved, null, 2));

if (!ok) process.exit(1);
