# PixLab Documentation Audit Report (Code-Evidenced)

Audit date: 2026-03-06

## Scope checked
- Runtime bootstrap/startup flow: `server.js`, `utils/loadEnv.js`, `utils/config.js`, `utils/validateEnv.js`.
- DB bootstrap/migrations: `db.js`, `scripts/migrate.js`, `scripts/migrations-status.js`, `scripts/migrations-rerun-check.js`, `scripts/verify-schema.js`.
- Deployment and verification scripts: `scripts/verify-production.js`, `package.json`, `docs/DEPLOY-PLESK.md`.
- Route/auth/limits/lifecycle surfaces were spot-checked against runtime sources (`server.js`, `utils/internalAuth.js`, `utils/limits.js`, cleanup workers under `utils/*Cleanup*.js`) and left unchanged where code evidence matched existing docs.

## ENV_FILE verdict
**Classification: runtime-supported**.

### Evidence
- `utils/loadEnv.js` reads `process.env.ENV_FILE`, resolves an absolute/repo-relative path, and loads it with `dotenv.config({ path, override: false })`.
- `utils/loadEnv.js` has fallback behavior to `<repo>/.env` when `ENV_FILE` is unset.
- `server.js` imports `envLoadResult` from `utils/loadEnv` at startup, so runtime server bootstrap uses this behavior.
- migration/verification scripts (`scripts/migrate.js`, `scripts/migrations-status.js`, `scripts/migrations-rerun-check.js`, `scripts/verify-schema.js`, `scripts/verify-production.js`) also import `utils/loadEnv`, so the same resolution applies to those script entrypoints.

## Incorrect documented items found before this update
- ENV docs omitted `ENV_FILE` from runtime-supported keys even though bootstrap code supports it.
- Env totals were off by one due to this omission.
- Deployment doc did not describe runtime env file resolution order.

## Newly documented supported items
- Added `ENV_FILE` as runtime-supported env key.
- Added explicit env loading order (`ENV_FILE` -> fallback `.env` -> process env).

## Removed unsupported items
- None removed in this pass (conservative update).

## Confirmed-and-unchanged items
- Existing docs statement that runtime uses canonical unit-aware keys and not active `*_MS` keys is consistent with code (`utils/envTime.js` readers and env names used throughout runtime).
- Existing script-only env appendix remained valid for current script entrypoints (`REPRO_*`, `SMOKE_API_KEY`, `SIMULATE_ALERT_*`, `TEST_*`, `VERIFY_BASE_URL`).

## Ambiguous / not confirmed
- No additional ambiguous env-key claims were introduced in this pass.
