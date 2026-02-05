# 40 - Architecture and Request Lifecycle (code-evidenced)

## Legend
- **(A) code-enforced**: behavior is directly implemented in code.
- **(B) env-configurable**: behavior is toggled/parameterized by environment variables.
- **(C) convention**: behavior appears by naming/organization, not strict runtime checks.
- **(D) not confirmed**: could not be proven from code.

## Module diagram (runtime tree)

```text
server.js (Express app bootstrap)
├─ Core middleware
│  ├─ request id + idempotency parser
│  ├─ static serving (/assets, /h2i, /img-edit, /pdf, /tools)
│  ├─ CORS
│  ├─ body parsers + cookies + admin session store
│  └─ request logging + metrics recording
├─ External APIs (/v1/*)
│  ├─ /v1/h2i   -> routes/h2i-route.js
│  ├─ /v1/image -> routes/image-route.js
│  ├─ /v1/pdf   -> routes/pdf-route.js
│  └─ /v1/tools -> routes/tools-route.js
├─ Internal APIs (/internal/*)
│  ├─ subscription/bridge routes -> routes/subscription-route.js
│  └─ diagnostics + monitoring routes -> server.js
├─ Admin surface (mounted at /<ADMIN_PATH>/<ADMIN_PASS>)
│  └─ admin/adminRoutes.js
├─ Shared security/utilities
│  ├─ internal token/IP middleware -> utils/internalAuth.js
│  ├─ signed URL guard/signing -> utils/signedUrls.js
│  ├─ upload staging/limits -> utils/uploadLimits.js
│  └─ usage/quota ledger -> usage.js
└─ Background schedulers
   ├─ expiry watcher
   ├─ orphan cleanup
   ├─ retention cleanup
   ├─ ledger reclaim + ledger cleanup
   ├─ subscription events cleanup
   ├─ output/temp file cleanup + admin session cleanup
   └─ metrics + alert engine + snapshot cleanup
```

Evidence: `server.js` requires/mounts route modules and job starters; route/domain code lives in `routes/*.js`; auth/signing/upload helpers are in `utils/*.js`. (A)

---

## Server entrypoint(s) and initialization order

1. **Process/bootstrap config and fail-fast checks**: validates admin password behavior by env/stage, validates env, sets trust proxy, registers process-level exception handlers. (`server.js`) (A/B)
2. **Global request metadata middleware**: attaches `req.requestId` and `Request-Id` response header; parses and validates idempotency key headers and echoes `Idempotency-Key`. (`server.js`) (A)
3. **Filesystem prep and static mounts**: ensures `public/{h2i,img-edit,pdf,tools}` and `assets/logo` exist, then mounts static paths (signed guards on output paths; `/tools` can be unsigned when configured). (`server.js`, `utils/signedUrls.js`) (A/B)
4. **Transport/session middleware stack**: CORS, body parsers, cookie parser, MySQL-backed admin session store (`admin_sessions`). (`server.js`) (A/B)
5. **Request finish logging + metrics ingestion**: on `res.finish`, logs internal/external requests and records endpoint metric sample. (`server.js`, `utils/metrics.js`) (A)
6. **Route registration**:
   - `/health`
   - optional diagnostics routes (when diagnostics enabled)
   - monitoring routes
   - domain route modules (`/v1/*`, `/internal/*`)
   - admin router mount at dynamic base path
   - 404 fallback
   - error handler middleware. (`server.js`) (A/B)
7. **Startup routine (`startServer`)**: optional migrations, schema checks/repair attempt, listen, start metrics/alerts/snapshot cleanup and all configured schedulers. (`server.js`) (A/B)
8. **Shutdown routine**: stops schedulers/metrics/alerts, clears cleanup timers, closes admin session pool + DB pool. (`server.js`) (A)

---

## Middleware stack order (global)

Order in `server.js` is:
1. Request ID middleware. (A)
2. Idempotency-key parser/validator middleware. (A)
3. Static serving mounts (`/assets`, `/h2i`, `/img-edit`, `/pdf`, `/tools`) with signed guard where enabled. (A/B)
4. CORS middleware (origin allowlist, allow headers, expose `Request-Id` and `Idempotency-Key`, handles `OPTIONS`). (A/B)
5. `bodyParser.json` + `bodyParser.urlencoded` with configured size limit. (A/B)
6. `cookieParser`. (A)
7. `express-session` using `express-mysql-session` (`admin_sessions`). (A)
8. Request completion logger + metrics recorder. (A)
9. Route handlers. (A)
10. 404 handler. (A)
11. Unhandled error middleware (header/body redaction + runtime alert). (A)

### Admin router middleware order (inside mounted admin base)
Within `mountAdmin`:
1. debug middleware (`createAdminDebugMiddleware`).
2. response-time logger for admin requests.
3. no-store headers for `GET /login|/bootstrap|/`.
4. login-response debug instrumentation for `POST /login`.
5. `express.urlencoded` then `express.json`.
6. CSRF protection middleware (`csrfProtection`) for state-changing methods.
7. routes (`/login`, `/logout`, UI pages, `/api/*` guarded by session auth).
8. admin router error handler.

Evidence: `admin/adminRoutes.js`, `utils/csrf.js`. (A)

---

## Route registration and mount topology

- **External API**: route modules mount `POST /v1/h2i`, `POST /v1/image`, `POST /v1/pdf`, `POST /v1/tools`. (`routes/h2i-route.js`, `routes/image-route.js`, `routes/pdf-route.js`, `routes/tools-route.js`) (A)
- **Internal API**: subscription bridge/internal routes are mounted from `routes/subscription-route.js` (e.g., `/internal/ping`, user reconcile/summary/purge flows). (A)
- **Diagnostics/internal monitoring**: `/internal/admin/diagnostics/*` are conditionally registered; `/internal/admin/monitoring/*` routes are registered in `server.js`. (A/B)
- **Admin UI + Admin API**: admin router is mounted at `/${ADMIN_PATH}/${ADMIN_PASS}` via `mountAdmin`. (`server.js`, `admin/adminRoutes.js`) (A/B)
- **Static output fetches**: `/h2i/*`, `/img-edit/*`, `/pdf/*`, `/tools/*` static mounts in `server.js` with `signedStaticGuard()` where configured. (`server.js`, `utils/signedUrls.js`) (A/B)

---

## Request lifecycle by route class

### 1) `/v1/*`
1. Global middleware runs (request-id/idempotency/static/CORS/body/session/logging). (A)
2. Endpoint route chain runs: API key check (`checkApiKey`), endpoint guard (`createEndpointGuard`), optional customer burst limiter, timeout middleware, upload middleware (where needed), daily rate limit checks, then action handler. (A/B)
3. Customer key flows reserve quota before heavy work and finalize/refund through ledger-aware usage helpers. (`usage.js`) (A/B)
4. Response returns signed output URLs for file-producing endpoints; tools returns JSON analytics payload. (A)

Evidence: `server.js`, `routes/*-route.js`, `usage.js`, `utils/limits.js`, `utils/uploadLimits.js`, `utils/signedUrls.js`. (A)

### 2) `/internal/*`
1. Global middleware runs first. (A)
2. Internal auth chain (`internalMiddleware` or stricter diagnostics middleware): IP allowlist + bridge token + internal rate limit. (`utils/internalAuth.js`) (A/B)
3. Route-specific logic executes (subscription reconciliation/usage APIs, diagnostics, monitoring snapshot endpoints). (`routes/subscription-route.js`, `server.js`) (A)

### 3) Admin UI + Admin API
1. Global middleware (including session support) runs. (A)
2. Mounted admin path middleware runs in `mountAdmin` order (debug/no-cache/body parsers/CSRF). (A)
3. Authentication gate:
   - `/login` handles password+TOTP and lockout tracking.
   - all admin API/UI routes use `requireAuth` (session `adminAuthenticated`).
4. Admin API endpoints mutate/read log settings, alerts, monitoring rules/silence/ack, and subscription event views/exports. (`admin/adminRoutes.js`) (A/B)

### 4) Static output fetch (`/h2i/*`, `/img-edit/*`, `/pdf/*`, `/tools/*`)
1. Path enters static middleware mounted before API routes. (A)
2. `signedStaticGuard` verifies `exp`/`sig` when signing is required (`REQUIRE_SIGNED_OUTPUT_URLS`/signed URL config). (A/B)
3. `express.static` serves the file from corresponding public directory with signed headers (`Cache-Control`, `nosniff`) when configured. (A/B)
4. `/tools` is conditionally unsigned when signed outputs are disabled. (A/B)

---

## Processing pipelines by domain

## H2I pipeline (`/v1/h2i`)
1. Guard chain: API key, limits, burst limit, timeout, public daily limit. (`routes/h2i-route.js`) (A/B)
2. Validates action (`image|pdf`), HTML presence, max HTML length, viewport + pixel ceilings. (A/B)
3. For customer keys: reserves quota before render. (A)
4. Acquires semaphore slot (`H2I_CONCURRENCY`) and launches Puppeteer (optional no-sandbox). (A/B)
5. Enables request interception:
   - blocks `file:` unless allowed,
   - blocks localhost/private ranges/metadata IP,
   - resolves DNS and enforces rebinding policy (`strict|pin` modes via config). (A/B)
6. Renders page content; emits either screenshot or PDF.
7. Writes output file to `public/h2i/<uuid>.(png|jpg|pdf)` and returns signed URL via `buildSignedUrl`. (A)
8. Finalizes usage on success; records/refunds on errors/duplicates; closes browser and releases semaphore. (A)

## Image pipeline (`/v1/image`)
1. Guard chain: API key, endpoint guard, burst, timeout, upload middleware, action/mime validation, daily limit. (A/B)
2. Upload middleware stages files to temp dir with size/count/optional dimension checks. (`utils/uploadLimits.js`) (A/B)
3. Handler parses action and transform params; supports metadata-only path and transform/pdf paths. (A)
4. For transform path, uses Sharp pipeline (crop/resize/rotate/flip/blur/sharpen/colorspace/background/padding/border/watermark/etc.) and optional PDF output using `pdf-lib`. (A)
5. Writes outputs under `public/img-edit/<uuid>.<ext>` and returns signed URLs; metadata action returns JSON only. (A)
6. Finalizes quota/usage; deletes staged temp uploads in `finally`. (A)

## PDF pipeline (`/v1/pdf`)
1. Guard chain: API key, endpoint guard, burst, timeout, upload middleware, daily limit; validates PDFs. (A/B)
2. Parses `action` and dispatches per action (e.g., merge, to-images, compress, extract-images, split/extract/rotate/watermark/protect/unlock, etc.). (A)
3. Uses a mix of:
   - `pdf-lib` in-memory operations,
   - system tools (`qpdf`, `pdftoppm`, `pdfimages`) for certain actions,
   - Sharp for image conversions. (A/B)
4. Writes outputs to `public/pdf/<uuid>.<ext>` and returns signed URL(s). (A)
5. Applies page limits and semaphore concurrency controls; finalizes/refunds usage and removes staged uploads/temp intermediates. (A/B)

## Tools pipeline (`/v1/tools`)
1. Guard chain: API key, endpoint guard, burst, timeout, upload middleware, action validation, daily limit. (A/B)
2. Accepts tools list (`single|multitask`) and executes analyzers (metadata/exif/hash/palette/similarity/quality/efficiency/transparency) over uploaded images. (A)
3. Responds with JSON analysis payload; **current implementation does not persist tool outputs into `public/tools`**. (`toolsDir` is injected but unused in route logic.) (A)
4. Deletes staged upload files in `finally`; finalizes/refunds usage accordingly. (A)

---

## Data & storage model

### Database roles (observed usage)
- `api_keys`: key validation, subscription status, lifecycle normalization/deletion, reconcile lookups. (`server.js`, `utils/customerKeys.js`, `routes/subscription-route.js`, `utils/expiryWatcher.js`) (A)
- `usage_monthly`: per-key/period usage, reserved/finalized files, endpoint counters, bytes/errors; used for quota checks and reporting. (`usage.js`, `routes/subscription-route.js`) (A)
- `quota_ledger`: idempotent reservation/finalization/refund ledger and reclaim/cleanup jobs. (`usage.js`, `utils/ledgerReclaim.js`, `utils/ledgerCleanup.js`) (A)
- `request_log`: request usage log table + schema checks/index requirements. (`utils/requestLog.js`, `server.js`) (A)
- `rate_limits_daily`: public per-IP/day counters for h2i/image/pdf/tools rate limits. (`utils/rateLimitsDaily.js`, route modules) (A)
- `plans`: plan lookup in internal subscription flows and usage shaping. (`routes/subscription-route.js`) (A)
- `admin_sessions`: express-session backing store and cleanup job target. (`server.js`) (A)
- subscription/alert event tables: consumed by subscription event query/cleanup and alert engine workflows. (`utils/subscriptionEvents.js`, `utils/subscriptionEventsCleanup.js`, `utils/alertEngine.js`) (A)

### Public output directories
- `public/h2i` for H2I outputs.
- `public/img-edit` for image pipeline outputs.
- `public/pdf` for PDF pipeline outputs.
- `public/tools` is statically exposed, but tools route currently returns JSON and does not write files.
- `assets/logo` and `/assets` static mount for admin/UI assets.

Evidence: directory creation + static mounts in `server.js`; route writers in `routes/h2i-route.js`, `routes/image-route.js`, `routes/pdf-route.js`. (A)

### Temp/staging directories
- Upload staging: OS tmp dir `pixlab-uploads` via `ensureTempDir()` and custom multer storage. (`utils/uploadLimits.js`) (A)
- Monitoring snapshots: OS tmp dir `pixlab-alert-snapshots`. (`utils/monitoringSnapshot.js`) (A)
- Additional transient PDF action temp files are created and unlinked in PDF route helpers. (`routes/pdf-route.js`) (A)

---

## Signed URL generation and static serving guards

- Producers call `buildSignedUrl(baseUrl, pathname, ttl?)`, which signs `pathname|exp` with HMAC and appends `exp` + `sig` if signing secret exists. (`utils/signedUrls.js`) (A/B)
- Static fetch path middleware uses `signedStaticGuard()` to enforce presence, parseability, expiration, and signature validity when signed URLs are required. (`utils/signedUrls.js`) (A/B)
- Header hardening for signed static responses is provided by `createSignedStaticHeaders()` (`Cache-Control`, `X-Content-Type-Options`). (`utils/signedUrls.js`) (A)

---

## Background jobs and schedulers

Jobs started from `startServer()` and/or top-level timers in `server.js`:

1. **Expiry watcher**: normalizes expired active keys to disabled/expired, then deletes disabled+expired keys in batches under DB lock. (`utils/expiryWatcher.js`) (A/B)
2. **Orphan cleanup**: removes rows in related tables where `api_key_id` no longer resolves, using DB lock + batching. (`utils/orphanCleanup.js`) (A/B)
3. **Retention cleanup**: purges aged `request_log` and `usage_monthly` data per retention env settings. (`utils/retentionCleanup.js`) (A/B)
4. **Ledger reclaim**: reclaims stale pending quota reservations. (`utils/ledgerReclaim.js`) (A/B)
5. **Ledger cleanup**: deletes aged `quota_ledger` rows by retention window. (`utils/ledgerCleanup.js`) (A/B)
6. **Subscription events cleanup**: periodic deletion by subscription-event retention settings under DB lock. (`utils/subscriptionEventsCleanup.js`) (A/B)
7. **Public output cleanup** (`cleanupOldFiles`): deletes old files in public output dirs; lock-protected. (`server.js`) (A/B)
8. **Temp upload cleanup** (`cleanupTempUploads`): deletes old files in temp upload dir. (`server.js`) (A/B)
9. **Admin sessions cleanup**: deletes expired/aged `admin_sessions`. (`server.js`) (A/B)
10. **Metrics/alerts/snapshot maintenance**: starts metrics loop, alert engine loop, and snapshot file cleanup interval. (`server.js`, `utils/alertEngine.js`, `utils/monitoringSnapshot.js`) (A)

---

## Monitoring/alerts snapshot flow

1. **Protected internal endpoints**: `/internal/admin/monitoring/metrics`, `/snapshot-view`, `/snapshot`, `/snapshot-debug/ping` are guarded by `diagnosticsInternalMiddleware` (allowlisted IP + bridge token + internal rate limit). (`server.js`, `utils/internalAuth.js`) (A/B)
2. **URL generation**: snapshot helper resolves base URL from env/header fallbacks and builds `/internal/admin/monitoring/snapshot-view` and `/snapshot` URLs. (`utils/monitoringSnapshot.js`) (A/B)
3. **Image generation strategy** (`generateAlertSnapshot`):
   - first tries direct fetch of snapshot image endpoint,
   - otherwise launches Puppeteer to render snapshot view and take screenshot,
   - may retry/fallback fetch paths,
   - writes PNG into snapshot temp directory and returns buffer/metadata. (`utils/monitoringSnapshot.js`) (A/B)
4. **Alert usage**:
   - admin test endpoint invokes snapshot generation and attaches image to test alerts,
   - background alert engine also builds snapshot URLs and can embed generated snapshots in notifications. (`admin/adminRoutes.js`, `utils/alertEngine.js`) (A)
5. **Snapshot retention**: periodic cleanup removes stale files from snapshot temp dir. (`utils/monitoringSnapshot.js`, `server.js`) (A)

---

## Known unknowns

- The exact schema names for monitoring alert tables are referenced via alert-engine utilities, but table DDL is not documented in this file set. (D)
- `public/tools` static mount exists, but no current `/v1/tools` write path was found; if another module writes there outside route handlers, it is not confirmed in this extraction scope. (D)
