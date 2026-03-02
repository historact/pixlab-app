# PixLab ENV Catalog (discovery index)

This document is a **discovery index only**.

- Canonical ENV specification: [`docs/61-env-reference.md`](./61-env-reference.md)
- Runtime validator: `utils/validateEnv.js`
- Config accessors/parsers: `utils/config.js`

## Purpose

Use this file to quickly locate where ENV keys are read in code. Do **not** use this file as release policy for defaults/requiredness.

## Runtime discovery commands

```bash
# All direct process.env reads in runtime server code
rg -n "process\.env(?:\.[A-Z0-9_]+|\[['\"][A-Z0-9_]+['\"]\])" server.js db.js routes utils admin

# Script/tooling-only process.env reads
rg -n "process\.env(?:\.[A-Z0-9_]+|\[['\"][A-Z0-9_]+['\"]\])" scripts

# Startup validation policy and production gates
rg -n "alwaysRequired|requireInProduction|booleanVars|intVars|enumVars|floatVars" utils/validateEnv.js
```

## Discovery anchors by subsystem

- **Boot/runtime wiring**: `server.js`, `db.js`
- **ENV parsing/defaults**: `utils/config.js`
- **ENV validation**: `utils/validateEnv.js`
- **Auth + admin auth**: `server.js`, `utils/adminAuth.js`, `utils/internalAuth.js`
- **Signed output URLs**: `utils/signedUrls.js`
- **Rate limits/quotas**: `utils/rateLimitsDaily.js`, `utils/burstLimits.js`, `usage.js`
- **Retention + cleanup workers**: `utils/retentionCleanup.js`, `utils/subscriptionEventsCleanup.js`, `utils/adminSessionsCleanup.js`, `utils/alertRetentionCleanup.js`
- **Monitoring/snapshot URL resolution**: `utils/monitoringSnapshot.js`

## Deterministic policy note

Runtime configuration is canonicalized to one ENV key per feature in server/runtime paths. `docs/61-env-reference.md` is the source of truth for allowed keys and production requirements.
