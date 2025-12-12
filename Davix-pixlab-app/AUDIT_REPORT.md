# Davix Pixlab Subscription/API Audit Map

## 1) Inventory (files & roles)
- **server.js** – Express bootstrap, static serving, CORS, API-key middleware, timeout, cleanup job, and mounts feature + internal routes.
- **db.js** – MySQL pool + helper query + migration runner (uses `migrations/001_api_keys_schema.sql`).
- **usage.js** – Monthly usage retrieval/creation, quota check, and logging into `usage_monthly` + `request_log`.
- **utils/apiKeys.js** – Key prefix extraction, random key generation (`dvx_live_*`), hashing/verification (argon2/bcrypt/scrypt fallback).
- **utils/customerKeys.js** – Customer key lookup by prefix/hash, validity checks, plan resolution, provision/activation/disable/legacy upgrade helpers.
- **utils/errorResponse.js** – Standardized JSON error emitter.
- **routes/h2i-route.js** – `/v1/h2i` HTML→image with public IP rate limit and customer quota tracking/logging.
- **routes/image-route.js** – `/v1/image` image edits/conversions; per-IP public limits; usage logging.
- **routes/pdf-route.js** – `/v1/pdf` PDF merge/split/convert/compress; public limits; usage logging.
- **routes/tools-route.js** – `/v1/tools` metadata/colors/hash/orientation analysis; public limits; usage logging.
- **routes/subscription-route.js** – Internal subscription/WP bridge admin endpoints (plan sync, key lifecycle, listing, rotation, debug) guarded by `X-Davix-Bridge-Token`.
- **usage.js** – Shared usage tracking utilities.
- **scripts/** – `run-migrations.js` (applies SQL migrations) and `customer-key-smoke.js` test helper.
- **migrations/001_api_keys_schema.sql** – Creates/aligns `api_keys` table with hashed keys + indexes.
- **public/** – Generated asset outputs (h2i, img-edit, pdf, tools).

## 2) Routing map (Express)
_All `/v1/*` routes require API key (owner/public/customer). All `/internal/*` routes require `X-Davix-Bridge-Token` (bridge token)._  
- **POST /v1/h2i** (h2i-route): body `{ html (req), css, width, height, format }`; customer quota check; logs to `usage_monthly` + `request_log`; responds `{ url }`.
- **POST /v1/image** (image-route): multipart `images[]`; options (format, resize/crop/rotate/flip, quality/targetSizeKB, pdf opts, palette/hash flags); public per-IP/day (10) & size caps; customer quota+logging; response `{ results:[{url, format, sizeBytes, width, height, quality, originalName}] }`.
- **POST /v1/pdf** (pdf-route): multipart `files[]/file`; body `action` (`merge|split|compress|to-images|extract-images`) + options (`pages`, `ranges`, `dpi`, `width/height`, `quality`, etc.); public caps (10 files/10MB); customer quota+logging; response varies (URLs, page ranges, image URLs).
- **POST /v1/tools** (tools-route): multipart `images[]`; body `tools` list (`metadata|colors|detect-format|orientation|hash`), `includeRawExif`, `paletteSize`, `hashType`; public caps; customer quota+logging; response `{ results:[{originalName, tools:{...}}] }`.
- **POST /internal/subscription/event** (subscription-route, bridge-token): body `{ event/status, customer_email?, plan_slug?, plan_id?, subscription_id|external_subscription_id?, order_id? }`; dispatches to activation/renew/disable via `activateOrProvisionKey` or `disableCustomerKey`; responds `{status:'ok', action:'created|updated|disabled', key?, key_prefix, plan_id, subscription_id, affected?}`.
- **POST /internal/wp-sync/plan** (bridge-token): upsert plan data (`plan_slug` required; quotas/limits/flags fields optional); uses `plans` table; responds `{status:'ok', action:'upserted', plan_slug}`.
- **GET /internal/admin/plans** (bridge-token): lists plans for admin dropdowns; response `{status:'ok', items:[{id, plan_slug, name, monthly_quota_files, billing_period, is_free}]}`.
- **GET /internal/admin/keys** (bridge-token): query `page`, `per_page`, `search` (email/subscription/key_prefix); reads `api_keys` + `plans`; responds `{status:'ok', items:[{subscription_id, customer_email, status, key_prefix, key_last4, updated_at, plan_slug}], total, page, per_page}`.
- **POST /internal/admin/key/provision** (bridge-token): body `{customer_email?, plan_slug (req), subscription_id?, order_id?}`; calls `activateOrProvisionKey`; responds `{status:'ok', action:'created|updated', key?, key_prefix, key_last4, plan_id, subscription_id}`.
- **POST /internal/admin/key/disable** (bridge-token): body `{subscription_id? or customer_email?}`; calls `disableCustomerKey`; responds `{status:'ok', action:'disabled', affected}`.
- **POST /internal/admin/key/rotate** (bridge-token): body `{subscription_id? or customer_email?}`; regenerates hash/prefix via `generateApiKey`; clears legacy `license_key`; returns plaintext once `{status:'ok', action:'rotated', key, key_prefix, key_last4, subscription_id}`.
- **GET /internal/subscription/debug** (bridge-token): reports token configured flag and list of plan slugs; response `{status:'ok', debug:{tokenConfigured, dbConnected, plans}}`.

## 3) Database schema map
- **plans**: `id` PK; `plan_slug` UNIQUE; descriptive fields (`name`, `billing_period`, `description`, booleans allow_*), quota/limit fields (`monthly_quota_files`, `max_files_per_request`, `max_total_upload_mb`, optional `max_dimension_px`, `timeout_seconds`, `is_free`); timestamps; used to join to `api_keys` and to expose admin lists.
- **api_keys** (migrations): `id` PK; `key_prefix` UNIQUE; `key_hash`; `key_last4`; `status` ENUM active/disabled; `plan_id` FK (no FK constraint); customer identity (`customer_email`, `customer_name`), subscription IDs (`external_subscription_id`, deprecated `wp_*`, `subscription_id` usage in code), `order_id`; validity window (`valid_from`, `valid_until`); `metadata_json`; timestamps; legacy `license_key` kept for nulling; optional `rotated_at`. Relations: many-to-one with `plans`; queried by prefix, subscription_id, or email.
- **usage_monthly** (inferred via queries): `id` PK; `api_key_id` FK; `period` (YYYY-MM) UNIQUE per key; counters (`used_files`, `used_bytes`, `total_calls`, `total_files_processed`, per-endpoint call/file counters, `bytes_in/out`, `errors`); last error/code/message; `last_request_at`; timestamps.
- **request_log** (inferred): `id` PK; `timestamp`; `api_key_id` FK; `endpoint`; `action`; `status` (HTTP code); `error_code`; `files_processed`; `bytes_in`; `bytes_out`; `params_json` text/JSON. Inserted per request for customer keys.
- **schema_migrations**: created by migration runner; tracks applied SQL migration files.

## 4) Key lifecycle logic
- **activateOrProvisionKey** (`utils/customerKeys`): resolves plan by `plan_id`/`plan_slug`; finds existing key by `subscription_id` (preferred) else `customer_email` (latest). If none, generates new `dvx_live_*` key (hash+prefix+last4 stored, plaintext returned once), inserts active row and returns `{plaintextKey?, keyPrefix, keyLast4, planId, created:true}`. If existing, optionally regenerates hash/prefix when missing; updates status to active, plan/customer/subscription/order fields, nulls `license_key`, retains prefix/last4; returns plaintext only if a new hash generated.
- **disableCustomerKey**: updates matching rows (by `subscription_id` else `customer_email`) to `status='disabled'` and clears `license_key`.
- **rotate logic** (`/internal/admin/key/rotate`): finds latest row by subscription/email; generates new plaintext key, overwrites `key_prefix/hash/last4`, sets `rotated_at`/`updated_at`, clears legacy `license_key`, returns plaintext in response; no history kept beyond DB row.
- **Unique constraints**: enforced on `key_prefix` (schema) and optional UNIQUE `plan_slug` (plans). No uniqueness on `subscription_id` or `customer_email`; application logic assumes one-most-recent per identifier.
- **Plaintext key handling**: Only returned from `activateOrProvisionKey` when creating or when upgrading legacy without hash, and from rotation endpoint; stored hashed in DB (legacy `license_key` nullable/cleared).

## 5) Usage tracking
- **Insertion point**: Feature routes call `recordUsageAndLog` after work (or on validation errors) for customer keys. Public/owner keys skip logging.
- **request_log writes**: `recordUsageAndLog` inserts row with `timestamp=NOW()`, `api_key_id`, `endpoint`, `action`, HTTP-style `status` (200/500 etc.), `error_code`, `files_processed`, `bytes_in/out`, and serialized request params.
- **usage_monthly aggregation**: `getOrCreateUsageForKey` ensures row for current `period` (UTC month) creating with zeroed counters. `recordUsageAndLog` performs in-place `UPDATE` increments for totals, per-endpoint call/file counters (h2i/image/pdf/tools), byte counters, errors, and timestamps. No cron/rollup; aggregation happens per request.
- **Per-endpoint usage representation**: columns `h2i_calls/files`, `image_calls/files`, `pdf_calls/files`, `tools_calls/files`; `action` in `request_log` provides finer detail (e.g., `html_to_image`, `merge`, `metadata`).

## 6) Missing endpoints for user dashboard (proposed)
- **GET /internal/user/summary** (bridge token + user binding): query `customer_email` **or** `wp_user_id`/`subscription_id`; returns `{status:'ok', user:{customer_email, subscription_id, wp_user_id?}, plan:{plan_slug, name, monthly_quota_files}, key:{key_prefix, key_last4}, usage:{period, limit, used_files, used_bytes, total_calls, total_files_processed}, totals:{bytes_in, bytes_out, errors}, per_endpoint:{h2i:{calls,files}, image:{...}, pdf:{...}, tools:{...}}`. Authorization should require bridge token **and** server-side confirmation the caller is authorized for that identity (see Security).
- **POST /internal/user/key/rotate** (bridge token + identity binding): body `{customer_email? or subscription_id?}`; regenerates key via existing rotation helper; response `{status:'ok', action:'rotated', key, key_prefix, key_last4, subscription_id}`.
- **GET /internal/user/usage/monthly** (optional history): query same identity; returns `{status:'ok', history:[{period, used_files, used_bytes, total_calls, total_files_processed, per_endpoint..., bytes_in, bytes_out, errors}]}` ordered DESC.

## 7) Security notes
- Bridge-protected internal routes rely solely on `X-Davix-Bridge-Token`; they accept arbitrary `customer_email`/`subscription_id`, enabling lookup/rotation for any user if token leaked. Bind requests to authenticated WP user: include `wp_user_id` or signed JWT from WP so Node verifies ownership before returning key metadata or plaintext.
- Enforce identity binding for proposed `/internal/user/*` routes: either (a) WP signs requests with shared bridge token **plus** a per-user HMAC/JWT containing `customer_email/subscription_id/wp_user_id`; or (b) issue short-lived `user_token` from Node tied to identity after initial bridge-auth handshake.

## 8) What to build next (endpoints + queries)
- **user summary**: add handler (likely in `routes/subscription-route.js`) to join `api_keys` → `plans` → `usage_monthly` current period, filtering by subscription/email/wp_user_id and returning masked key fields + counters; also fetch per-endpoint counters from `usage_monthly` and aggregate totals from `request_log` if needed.
- **user key rotate**: reuse admin rotation logic but require identity match + bridge token; update `api_keys` row and return plaintext once.
- **monthly usage history**: SELECT from `usage_monthly` by `api_key_id` ordered by `period` DESC with limit; authorize via bridge token + identity.

### Files to touch for new endpoints
- `routes/subscription-route.js` (add `/internal/user/*` handlers + tighter auth helpers).
- `utils/customerKeys.js` (optional helper to find key by email/wp_user_id/subscription with masking).
- `usage.js` (optional helper to fetch historical usage summaries).
- `utils/errorResponse.js` (if new error codes/messages needed).
