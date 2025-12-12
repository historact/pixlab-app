# Davix API Audit Report

## Summary
- Express-based Node.js API (`server.js`) providing HTML-to-image, image editing, PDF tools, and utility endpoints with API key enforcement and per-endpoint public throttling.
- MySQL (mysql2/promise) is the sole database; tables include `plans`, `api_keys`, `usage_monthly`, and `request_log`, with no migrations present. Licensing data from WordPress is synced via internal `/internal/wp-sync/*` routes using a shared token, not LMFWC runtime checks.
- API key flow first accepts configured keys, then validates customer keys from `api_keys` joined to `plans`; usage logging and quota checks are applied for customer keys.
- No direct LMFWC/WooCommerce validation endpoints; LMFWC-related functionality is limited to WordPress sync routes and license-key lookups. Removal mainly affects license provisioning and quota tracking.

## System Overview
- **Runtime:** Node.js (version not pinned; assumes environment, uses `mysql2/promise`, `puppeteer`, `sharp`).
- **Package manager:** npm (package-lock.json present).
- **Framework:** Express 4 (`server.js`).
- **Entry point:** `server.js` (script `start`: `node server.js`).
- **Static files:** Served from `public/h2i`, `public/img-edit`, `public/pdf`, `public/tools` for generated assets.
- **Config:** Environment variables (`PORT`, `BASE_URL`, `API_KEYS`, `PUBLIC_API_KEYS`, `CORS_ORIGINS`, DB vars, `WP_SYNC_TOKEN`). No `.env` checked in.
- **Logging:** Console logging for server start, errors, and WP sync diagnostics.
- **Error handling:** Centralized `sendError` helper to JSON error responses; Express 404 handler and error middleware at end of stack.
- **Background jobs:** Interval cleanup deleting generated files older than 24h (`cleanupOldFiles`).

## Project Tree (key files)
- `server.js` – Express app, middleware, route mounting, cleanup job.
- `db.js` – MySQL connection pool + query helper.
- `usage.js` – Monthly usage tracking and request logging utilities.
- `routes/`
  - `h2i-route.js` – `/v1/h2i` HTML-to-image via Puppeteer.
  - `image-route.js` – `/v1/image` image editing/conversion.
  - `pdf-route.js` – `/v1/pdf` PDF utilities (merge, split, to-images, etc.).
  - `tools-route.js` – `/v1/tools` metadata/colors/hash utilities.
  - `wp-sync-route.js` – internal WordPress sync for plans/licenses/usage.
- `public/` – Output directories (`h2i`, `img-edit`, `pdf`, `tools`).

## Execution Flow
1. **Server start:** `server.js` creates Express app, ensures output dirs, sets static routes, CORS middleware, body parsers, API key check, timeout middleware, mounts routes, and starts listening (`PORT` default 3005).
2. **Middleware order (per mounted routes):**
   - CORS → body parsers → API key middleware (`checkApiKey`) → per-route timeout (`publicTimeoutMiddleware`) → per-route upload/rate-limit middleware → handlers.
3. **Auth/API key validation:**
   - If `API_KEYS` unset: treats caller as `owner` with full access.
   - Otherwise extracts key from query `?key=`, header `x-api-key`, or body `api_key`.
   - Matches configured keys (owner/public). If not matched, queries `api_keys` joined with `plans` to validate customer licenses and status/date windows. Sets `req.apiKeyType` to `customer` with plan/quota info. Missing/invalid → 401 JSON error.
4. **Rate limiting/throttling:**
   - In-memory per-IP/day limits for public keys on `/v1/h2i` (5/day), `/v1/image` (10 uploads/day), `/v1/pdf` (10 files/day), `/v1/tools` (10 uploads/day).
   - Public request timeout shorter (30s vs 5m for others).
5. **Request/response format:** JSON APIs; uploads via `multer` (memory). Responses are JSON with URLs to generated files or results arrays; errors via `sendError` JSON.
6. **Database touches:** Only after API key validation (customer) and in usage/quota flows; WP sync routes perform inserts/updates/deletes on `plans` and `api_keys`, and usage lookups/logging read/write `usage_monthly` and `request_log`.

**Flow diagram (text):**
```
Client -> Express server (server.js)
  -> CORS middleware
  -> Body parsers (JSON/urlencoded)
  -> checkApiKey
      -> configured key? owner/public
      -> else lookupCustomerKey -> MySQL api_keys + plans (status/date check)
  -> publicTimeoutMiddleware (duration by key type)
  -> Route-specific middlewares (multer uploads, per-IP daily limits, size guards)
  -> Handler (business logic: Puppeteer/sharp/pdf-lib, etc.)
      -> Usage/quota check (customer only)
      -> Processing & file writes under public/*
      -> recordUsageAndLog (customer)
  -> Response JSON or sendError
```

## API Inventory
| Method & Path | Purpose | Auth Required | Params/Body | Response | Handler (file:fn) | DB Tables | External Services |
| --- | --- | --- | --- | --- | --- | --- | --- |
| POST `/v1/h2i` | Render HTML/CSS to image via Puppeteer. | API key (owner/public/customer); public IP daily limit 5. | JSON: `html` (req), optional `css`, `width`, `height`, `format`. | `{ url }` pointing to saved image. | `routes/h2i-route.js`: POST handler. | `usage_monthly`, `request_log` (for customer logging). | Puppeteer (headless Chrome). |
| POST `/v1/image` | Image edit/convert, optional PDF output. | API key; public limits (10 files, 10MB total, dimension cap). | Multipart `images[]`; body options: `format`, `width/height`, crop/rotate/flip, `targetSizeKB`, `quality`, PDF options, etc. | `{ results: [{url, format, sizeBytes, width, height, quality, originalName}] }`. | `routes/image-route.js`: POST handler. | `usage_monthly`, `request_log` (customer). | Sharp, pdf-lib for PDFs. |
| POST `/v1/pdf` | PDF tools: merge, split, compress, convert to images/extract images. | API key; public caps (10 files, 10MB). | Multipart `files[]` (or `file`); body `action` (`merge`, `split`, `compress`, `to-images`, `extract-images`), extra options (`pages`, `width`, `height`, `dpi`, `ranges`, etc.). | JSON result (URLs or details). | `routes/pdf-route.js`: POST handler. | `usage_monthly`, `request_log` (customer). | `pdftoppm` via `execFile`, Sharp, pdf-lib. |
| POST `/v1/tools` | Image metadata/colors/hash/orientation analysis. | API key; public caps (10 files, 10MB, dimension cap). | Multipart `images[]`; body `tools` list (`metadata`, `colors`, `detect-format`, `orientation`, `hash`), `includeRawExif`, `paletteSize`, `hashType`. | `{ results: [{originalName, tools:{...}}] }`. | `routes/tools-route.js`: POST handler. | `usage_monthly`, `request_log` (customer). | Sharp, exifr, crypto (hashing). |
| POST `/internal/wp-sync/test` | Health check for WP bridge. | Requires `X-Davix-Bridge-Token` matching `WP_SYNC_TOKEN`. | None. | `{ status:'ok', baseUrl }`. | `routes/wp-sync-route.js`. | None. | None. |
| POST `/internal/wp-sync/plan` | Upsert plan records from WordPress. | Token header. | JSON: `name` (slug), `monthly_quota`, optional `features` object. | `{ status:'ok' }`. | `routes/wp-sync-route.js`. | `plans`. | None. |
| POST `/internal/wp-sync/license-upsert` | Insert/update license/API key from WordPress. | Token header. | JSON: `license_key` (req), `plan_name`/`plan_id`, `status`, customer info, WP IDs, validity dates, `metadata`. | `{ status:'ok', action, normalized_status }`. | `routes/wp-sync-route.js`. | `api_keys` (plus plan lookup). | None. |
| POST `/internal/wp-sync/license-delete` | Delete license by key. | Token header. | JSON: `license_key` (req). | `{ status:'ok' }`. | `routes/wp-sync-route.js`. | `api_keys`. | None. |
| GET `/internal/wp-sync/debug/license` | Fetch license row for debugging. | Token header. | Query `license_key` (req). | `{ status:'ok', license }`. | `routes/wp-sync-route.js`. | `api_keys`. | None. |
| GET `/internal/wp-sync/usage-summary` | Summary usage for a license. | Token header. | Query `license_key` (req). | License + usage summary. | `routes/wp-sync-route.js`. | `api_keys`, `plans`, `usage_monthly`. | None. |
| GET `/internal/wp-sync/usage-log` | Request log for a license. | Token header. | Query `license_key` (req), optional `limit`. | `{ logs:[...] }`. | `routes/wp-sync-route.js`. | `api_keys`, `request_log`. | None. |
| POST `/internal/wp-sync/full-sync` | Placeholder endpoint for full sync trigger. | Token header. | None. | `{ status:'ok', message }`. | `routes/wp-sync-route.js`. | None. | None. |

## Database Schema & Usage
- **DB type/library:** MySQL via `mysql2/promise` pool (`db.js`). Pool: host/user/pass/name env vars, limit 10 connections, UTC timezone.
- **Migrations:** None found; schema inferred from queries.
- **Tables:**
  - `plans`: columns inferred `id`, `plan_slug`, `name`, `monthly_quota_files`, `description`, `created_at`, `updated_at`; upserted in `/internal/wp-sync/plan`.
  - `api_keys`: columns `id`, `license_key` (expected UNIQUE), `plan_id`, `status`, `customer_email`, `customer_name`, `wp_order_id`, `wp_subscription_id`, `wp_user_id`, `valid_from`, `valid_until`, `metadata_json`, timestamps. Insert/update in `/internal/wp-sync/license-upsert`; delete in `license-delete`; lookup during API key validation and debug routes. Route ensures UNIQUE index on `license_key` and deduplicates conflicts.
  - `usage_monthly`: columns `id`, `api_key_id`, `period (YYYY-MM)`, counters (`used_files`, `used_bytes`, `total_calls`, `total_files_processed`, `h2i_calls`, `h2i_files`, `image_calls`, `image_files`, `pdf_calls`, `pdf_files`, `tools_calls`, `tools_files`, `bytes_in`, `bytes_out`, `errors`, `last_error_code`, `last_error_message`, `last_request_at`, timestamps). Created lazily in `getOrCreateUsageForKey`; updated in `recordUsageAndLog`.
  - `request_log`: columns `id`, `timestamp`, `api_key_id`, `endpoint`, `action`, `status`, `error_code`, `files_processed`, `bytes_in`, `bytes_out`, `params_json`. Inserted in `recordUsageAndLog`; queried in `usage-log` route.
- **Queries per table:**
  - `plans`: INSERT ... ON DUPLICATE in `wp-sync-route.js` plan sync; SELECT by slug/name when resolving plan in `license-upsert`; JOIN with `api_keys` for usage summary.
  - `api_keys`: SELECT join in `lookupCustomerKey` (auth); INSERT/UPDATE/DELETE in WP sync routes; SELECT for debug/usage/log summary; UNIQUE index enforced at runtime.
  - `usage_monthly`: SELECT/INSERT in `getOrCreateUsageForKey`; UPDATE counters in `recordUsageAndLog`; SELECT in usage summary.
  - `request_log`: INSERT in `recordUsageAndLog`; SELECT in usage-log route.

## LMFWC Integration Findings
- **Location:** `routes/wp-sync-route.js` handles WordPress-originated license and plan sync via token-authenticated internal endpoints. No LMFWC client calls or WooCommerce REST usage; app assumes WordPress pushes data.
- **Dependency level:** Optional/adjacent. Core request auth relies on `api_keys` data populated via these sync routes, but runtime request handling does not call WordPress/LMFWC. Removing sync would freeze license updates but existing `api_keys` remain usable.
- **Environment variables:** `WP_SYNC_TOKEN` (shared secret for bridge). No consumer keys/secrets or WordPress URLs present.
- **Caching/retries:** None; direct DB writes with console warnings on failures. `ensureLicenseKeyUniqueIndex` adds UNIQUE index and dedupes rows within DB transaction.
- **Failure modes:**
  - Missing/incorrect token → 401.
  - DB errors in upsert/delete return 500 with error details; dedupe/index creation may rollback and log warning, leaving potential duplicates.
  - No retry/backoff; caller must retry.
- **What breaks if removed:**
  - New/updated licenses and plans would stop syncing; `api_keys` table would not receive changes. Existing customer authentication and quota enforcement continue until data becomes stale. Usage summary/log endpoints for WordPress admins would fail.

## Security Findings
- **API keys:** Accepted from query (`?key=`), header `x-api-key`, or body `api_key`. If `API_KEYS` empty, all requests treated as owner (no restriction) — risk if unset in production.
- **Key storage:** Customer keys stored as `license_key` in MySQL; not hashed. Status/date checks applied.
- **Secrets:** All configuration via environment vars; no secret rotation; `WP_SYNC_TOKEN` protects sync routes.
- **CORS:** Allowed origins from `CORS_ORIGINS` env (default includes `https://h2i.davix.dev`, `https://davix.dev`, `https://www.davix.dev`). Returns 204 for OPTIONS. Vary header set.
- **Request limits:** Public users limited by in-memory per-IP counters (reset on restart); payload size capped to 20MB body parsers. File size constraints only for public routes.
- **File handling:** Uploads kept in memory (multer default). Generated files written to public directories and served statically; cleanup job removes >24h old. No filename sanitation needed due to UUID naming, but user-uploaded PDFs/images processed by `sharp`, `pdf-lib`, `pdftoppm`.
- **SSRF/HTML rendering:** `/v1/h2i` accepts arbitrary HTML/CSS and renders in Puppeteer with `--no-sandbox`; potential SSRF or arbitrary network access inside page unless sandboxed at host/network level.
- **Logging:** Console logs include errors and WP sync bodies (license upsert logs entire request body) – potential PII exposure in logs.
- **Encryption/Hashing:** Only hashing for tools endpoint (`crypto` hashes or perceptual hash). No TLS termination handled here (assumed upstream).
- **Webhook signatures:** None present.

## Subscription Sync Findings
- No webhook/event receiver for WooCommerce or WP Swings subscriptions. Licensing updates rely on manual/bridge POSTs to `/internal/wp-sync/*`. No idempotency keys or retry handling beyond DB upsert. Therefore: **No subscription event receiver found.**

## Recommended Cleanup Plan
1. **Isolate LMFWC/WP sync code:** Extract or flag `routes/wp-sync-route.js` and `lookupCustomerKey` dependencies on `api_keys`/`plans`. Consider toggling via env flag if removing.
2. **Stub license provisioning:** If removing LMFWC bridge, create alternative `LicenseProvider` interface with methods `getLicense(key)` and `syncLicense(data)`; stub to return inactive/null to disable customer auth while keeping owner/public keys operational.
3. **Preserve runtime by default:** Keep `API_KEYS` non-empty to avoid open access; ensure static owner key configured before removing WordPress sync.
4. **Database adjustments:** Optionally add migrations to enforce UNIQUE on `api_keys.license_key` and define schemas for `plans`, `usage_monthly`, `request_log` to replace runtime DDL attempts.
5. **Risk mitigation:**
   - Stale license/quota data after removing sync; mitigate by seeding `api_keys` manually or switching auth to another provider.
   - In-memory rate limits reset on restart; consider persistent rate limiter if needed.
   - Logging sensitive data; reduce request body logging before removal.
6. **Test checklist:**
   - API key auth paths for owner/public/customer (with/without DB entries).
   - Each endpoint happy-path and quota exhaustion for customer keys.
   - WP sync routes return 401 with wrong token and succeed with correct token.
   - File cleanup still removes outputs after 24h.
   - CORS preflight responses from allowed and disallowed origins.

## Open Questions / Missing Info
- Actual deployed Node.js version and Puppeteer compatibility (not pinned).
- Real database schema definitions (types/indexes) should be confirmed against production DB; no migrations present.
- Expected plan/feature metadata structure from WordPress (`features` object) is not documented.
- Whether `API_KEYS` is intentionally empty in some environments (would allow unauthenticated access).
