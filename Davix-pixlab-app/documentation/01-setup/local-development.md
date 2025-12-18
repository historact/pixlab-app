# Local Development

## Prerequisites
- Node.js (matches package.json engines if specified; tested with current container runtime).
- MySQL database accessible with credentials in environment variables.
- `pdftoppm` binary available for PDF rasterization.

## Environment Variables
Set as needed before running:
- `PORT` (default `3005`).
- `BASE_URL` for absolute asset URLs (defaults to `http://localhost:PORT`).
- `CORS_ORIGINS` comma list of allowed origins.
- `API_KEYS` comma-separated owner/public keys.
- `PUBLIC_API_KEYS` subset of API_KEYS treated as public.
- `DB_HOST`, `DB_USER`, `DB_PASS`, `DB_NAME` for MySQL.
- `SUBSCRIPTION_BRIDGE_TOKEN` token required by internal endpoints.
- Cleanup/job toggles: `EXPIRY_WATCHER_ENABLED`, `EXPIRY_WATCHER_INTERVAL_MS`, `EXPIRY_WATCHER_BATCH_SIZE`, `ORPHAN_CLEANUP_ENABLED`, `ORPHAN_CLEANUP_INTERVAL_MS`, `ORPHAN_CLEANUP_BATCH`, `ORPHAN_CLEANUP_INITIAL_DELAY_MS`, `RETENTION_CLEANUP_ENABLED`, `RETENTION_CLEANUP_INTERVAL_MS`, `RETENTION_INITIAL_DELAY_MS`, `RETENTION_REQUEST_LOG_DAYS`, `RETENTION_USAGE_MONTHLY_MONTHS`, `RETENTION_BATCH_REQUEST_LOG`, `RETENTION_BATCH_USAGE_MONTHLY`, `RETENTION_LOG_PATH`.
- Debug toggles: `DAVIX_DEBUG_INTERNAL`, request logging paths.

## Install
```bash
npm install
```

## Database Migrations
```bash
node scripts/run-migrations.js
```
This runs SQL files in `migrations/` via `db.js`.

## Start Server
```bash
node server.js
```

## Smoke Tests
- `node scripts/repro-all-endpoints.js` exercises endpoints.
- `node scripts/customer-key-smoke.js` checks customer key flow.
- `node scripts/user-summary-smoke.js` hits summary endpoint.
