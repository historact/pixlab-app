# PixLab Environment Variable Reference

_Last updated: 2026-03-02 (full repo scan aligned with current runtime + scripts)._

## Recent behavior notes (code-backed)
- **Production now hard-requires signed outputs**: production forces signing ON; startup validation fails without `SIGNED_URL_SECRET`/valid signed config, and signed URL building throws when secret is absent.
- **Production now hard-requires internal IP allowlist**: `validateEnv()` fails startup when `INTERNAL_ALLOWED_IPS` is empty in production.
- **`/image` is the canonical static output path**: API output URLs are generated as `/image/...`; `/img-edit/...` remains a static alias mount for compatibility.
- **Per-table cleanup knobs are first-class**: request log, usage monthly, rate-limit tables, orphan cleanup, admin sessions, and subscription-event cleanup all have independent `*_CLEANUP_*` / `*_RETENTION_*` env knobs validated in `utils/validateEnv.js`.

Evidence model: (A) code-enforced, (B) env-configurable, (C) convention, (D) not confirmed.


## Canonical source of truth
- This file (`61-env-reference.md`) is the authoritative ENV reference.
- `02-env-catalog.md` should be treated as navigational/index content; when conflicts exist, this file wins because defaults/validation here are code-derived.


## Master table

| ENV key | Default | Type/Parsing | Validation | Used in | Controls | Prod vs Dev | Sensitivity | Related |
|---|---|---|---|---|---|---|---|---|
| `ADMIN_SESSIONS_CLEANUP_INTERVAL_MS` | see usage line (inline fallback present) | integer-like | validated by `validateEnv` | `server.js:920` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `ADMIN_SESSIONS_RETENTION_DAYS` | see usage line (inline fallback present) | integer-like | validated by `validateEnv` | `server.js:921` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `ALERT_TELEGRAM_API_BASE_URL` | see usage line (inline fallback present) | string | none | `utils/alerts.js:338`, `scripts/test-alert-notification-pipeline.js:41` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | sensitive | — |
| `INTERNAL_BASE_URL` | none | string | none | `utils/monitoringSnapshot.js:41` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | sensitive | — |
| `PUBLIC_BASE_URL` | none | string | required in production by `validateEnv` | `server.js:165`, `server.js:332`, `utils/validateEnv.js:100` | Behavior referenced by code paths listed in details section | required in production | sensitive | — |
| `REPRO_BASE_URL` | see usage line (inline fallback present) | string | none | `scripts/repro-all-endpoints.js:5` | Script/tooling behavior only | same unless caller branches on NODE_ENV | non-sensitive | — |
| `SNAPSHOT_BASE_URL` | none | string | none | `utils/monitoringSnapshot.js:33` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | sensitive | — |
| `ADMIN_AUDIT_LOG_ENABLED` | none | boolean-like (`true/false/1/0`) | validated by `validateEnv` | `utils/logger.js:130`, `utils/logger.js:297` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `ADMIN_LOGIN_LOCK_MINUTES` | see usage line (inline fallback present) | integer-like | validated by `validateEnv` | `utils/adminAuth.js:23` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `ADMIN_LOGIN_MAX_ATTEMPTS` | see usage line (inline fallback present) | integer-like | validated by `validateEnv` | `utils/adminAuth.js:22` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `ADMIN_LOGIN_WINDOW_MINUTES` | see usage line (inline fallback present) | integer-like | validated by `validateEnv` | `utils/adminAuth.js:21` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `ADMIN_PASS` | none (must be set) | string | validated by `validateEnv` (always required) | `server.js:102`, `server.js:108`, `utils/validateEnv.js:74` | Behavior referenced by code paths listed in details section | always required (prod + dev) | secret | — |
| `ADMIN_PASSWORD_HASH` | see usage line (inline fallback present) | string | validated by `validateEnv` (required in all environments; bcrypt hash only) | `utils/adminAuth.js:59`, `utils/validateEnv.js:86`, `utils/validateEnv.js:91` | Behavior referenced by code paths listed in details section | required in all environments | secret | — |
| `ADMIN_PATH` | see usage line (inline fallback present) | string | none | `server.js:101` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | sensitive | — |
| `ADMIN_SESSIONS_RETENTION_ENABLED` | none | boolean-like (`true/false/1/0`) | parser fallback only | `server.js:899` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `ADMIN_SESSION_SECRET` | none (must be set) | string | validated by `validateEnv` (always required) | `server.js:389`, `utils/csrf.js:28`, `utils/validateEnv.js:76` | Behavior referenced by code paths listed in details section | always required (prod + dev) | secret | — |
| `ADMIN_TOTP_SECRET` | none (must be set) | string | validated by `validateEnv` (always required) | `utils/adminAuth.js:77`, `utils/validateEnv.js:75` | Behavior referenced by code paths listed in details section | always required (prod + dev) | secret | — |
| `ALERT_EMAIL_FROM` | see usage line (inline fallback present) | string | none | `utils/alerts.js:178` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `ALERT_EMAIL_HOST` | none | string | none | `utils/alerts.js:162` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | sensitive | — |
| `ALERT_EMAIL_JSON_TRANSPORT` | see usage line (inline fallback present) | string | none | `scripts/test-alert-notification-pipeline.js:42`, `utils/alerts.js:163` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `ALERT_EMAIL_PASS` | see usage line (inline fallback present) | string | none | `utils/alerts.js:170` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | secret | — |
| `ALERT_EMAIL_PORT` | see usage line (inline fallback present) | integer-like | validated by `validateEnv` | `utils/alerts.js:167` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `ALERT_EMAIL_SECURE` | see usage line (inline fallback present) | string | none | `utils/alerts.js:168` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `ALERT_EMAIL_USER` | see usage line (inline fallback present) | string | none | `utils/alerts.js:169`, `utils/alerts.js:178` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `ALERT_TELEGRAM_BOT_TOKEN` | none | string | none | `scripts/test-alert-notification-pipeline.js:40`, `utils/alerts.js:257`, `utils/alerts.js:333` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | secret | — |
| `API_KEYS` | none (production must set non-empty) | string (comma/whitespace-separated list via `parseKeyList`) | validated by `validateEnv` (production required) | `server.js:658`, `utils/validateEnv.js:96` | Behavior referenced by code paths listed in details section | required in production; optional in dev | secret | — |
| `AUTO_RUN_MIGRATIONS` | none | boolean-like (`true/false/1/0`) | parser fallback only | `utils/config.js:113` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `BODY_PARSER_JSON_LIMIT` | see usage line (inline fallback present) | string | none | `utils/limits.js:41` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `BURST_LIMITS_WINDOW_RETENTION_ENABLED` | none | boolean-like (`true/false/1/0`) | validated by `validateEnv` | `utils/config.js:181` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `BURST_LIMITS_WINDOW_RETENTION_DAYS` | none | integer-like | validated by `validateEnv` | `utils/config.js:186` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `CORS_ORIGINS` | see usage line (inline fallback present) | string | none | `server.js:348` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `CUSTOMER_BURST_APPLIES_TO` | see usage line (inline fallback present) | enum (lowercased) | validated by `validateEnv` enum list | `utils/config.js:92` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `CUSTOMER_BURST_LIMIT_PER_MIN` | none | integer-like | validated by `validateEnv` | `utils/config.js:86` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `CUSTOMER_BURST_WINDOW_SECONDS` | none | integer-like | validated by `validateEnv` | `utils/config.js:87` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `DAVIX_DEBUG_INTERNAL` | see usage line (inline fallback present) | string | none | `admin/adminRoutes.js:2186`, `admin/adminRoutes.js:2223`, `admin/adminRoutes.js:2731`, ... | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | sensitive | — |
| `DB_HOST` | see usage line (inline fallback present) | string | required in production by `validateEnv` | `db.js:77`, `db.js:7`, `server.js:398` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | sensitive | — |
| `DB_NAME` | see usage line (inline fallback present) | string | required in production by `validateEnv` | `db.js:10`, `db.js:80`, `server.js:401` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `DB_PASS` | see usage line (inline fallback present) | string | none | `db.js:79`, `db.js:9`, `server.js:400` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | secret | — |
| `DB_USER` | see usage line (inline fallback present) | string | required in production by `validateEnv` | `db.js:78`, `db.js:8`, `server.js:399` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `ENABLE_DIAGNOSTICS` | none | string | none | `utils/config.js:146` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `API_KEYS_EXPIRY_WATCHER_BATCH_SIZE` | see usage line (inline fallback present) | integer-like | validated by `validateEnv` | `server.js:80` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `API_KEYS_EXPIRY_WATCHER_ENABLED` | none | boolean-like (`true/false/1/0`) | validated by `validateEnv` | `server.js:78` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `API_KEYS_EXPIRY_WATCHER_INTERVAL_MS` | see usage line (inline fallback present) | integer-like | validated by `validateEnv` | `server.js:79` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `GLOBAL_MAX_FILES_PER_REQ` | none | integer-like | validated by `validateEnv` | `utils/config.js:80` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `GLOBAL_MAX_TOTAL_UPLOAD_MB` | none | float | validated numeric when set | `utils/config.js:79` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `H2I_ALLOW_FILE_SCHEME` | none | boolean-like (`true/false/1/0`) | validated by `validateEnv` | `utils/config.js:68` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `H2I_BLOCK_PRIVATE_NETWORK` | none | boolean-like (`true/false/1/0`) | validated by `validateEnv` | `utils/config.js:156`, `utils/config.js:67` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `H2I_CONCURRENCY` | none | integer-like | parser fallback only | `utils/config.js:124` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `H2I_CONCURRENCY_WAIT_MS` | none | integer-like | parser fallback only | `utils/config.js:125` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `H2I_DNS_REBINDING_MODE` | see usage line (inline fallback present) | enum (lowercased) | validated by `validateEnv` enum list | `utils/config.js:154` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `IMAGE_CONCURRENCY` | none | integer-like | parser fallback only | `utils/config.js:132` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `IMAGE_CONCURRENCY_WAIT_MS` | none | integer-like | parser fallback only | `utils/config.js:133` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `INTERNAL_ALLOWED_IPS` | see usage line (inline fallback present) | string | validated by `validateEnv` (production requires non-empty list) | `utils/internalAuth.js:9` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `INTERNAL_RATE_LIMIT_PER_MIN` | see usage line (inline fallback present) | string | none | `utils/internalAuth.js:71` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `INTERNAL_RATE_LIMIT_WINDOW_SECONDS` | see usage line (inline fallback present) | string | none | `utils/internalAuth.js:72` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `QUOTA_LEDGER_CLEANUP_BATCH_SIZE` | none | integer-like | parser fallback only | `utils/config.js:216` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `QUOTA_LEDGER_CLEANUP_INTERVAL_DAYS` | none | integer-like | parser fallback only | `utils/config.js:208` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `QUOTA_LEDGER_ENABLED` | none | boolean-like (`true/false/1/0`) | parser fallback only | `utils/config.js:192` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `QUOTA_LEDGER_RECLAIM_BATCH_SIZE` | none | integer-like | parser fallback only | `utils/config.js:204` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `QUOTA_LEDGER_RECLAIM_INTERVAL_MS` | none | integer-like | parser fallback only | `utils/config.js:200` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `QUOTA_LEDGER_RETENTION_DAYS` | none | integer-like | parser fallback only | `utils/config.js:212` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `QUOTA_LEDGER_TTL_SECONDS` | none | integer-like | parser fallback only | `utils/config.js:196` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `MAX_HTML_CHARS` | see usage line (inline fallback present) | integer-like | validated by `validateEnv` | `routes/h2i-route.js:63` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `MAX_RENDER_HEIGHT` | see usage line (inline fallback present) | integer-like | validated by `validateEnv` | `routes/h2i-route.js:66` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `MAX_RENDER_PIXELS` | see usage line (inline fallback present) | integer-like | validated by `validateEnv` | `routes/h2i-route.js:64` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `MAX_RENDER_WIDTH` | see usage line (inline fallback present) | integer-like | validated by `validateEnv` | `routes/h2i-route.js:65` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `MAX_UPLOAD_BYTES` | none | integer-like | validated by `validateEnv` | `utils/limits.js:135` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `NODE_ENV` | none | string | none | `utils/config.js:4` | Behavior referenced by code paths listed in details section | defines production mode (`production` string check) | non-sensitive | — |
| `DB_ORPHAN_CLEANUP_ENABLED` | none | boolean-like (`true/false/1/0`) | validated by `validateEnv` | `server.js:81` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `OUTPUT_CACHE_CONTROL` | see usage line (inline fallback present) | string | none | `utils/config.js:57` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `OWNER_MAX_FILES_PER_REQ` | none | integer-like | validated by `validateEnv` | `utils/limits.js:124` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `OWNER_IMAGE_MAX_DIMENSION_PX` | none | integer-like | validated by `validateEnv` | `utils/limits.js:110` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `OWNER_IMAGE_MAX_TOTAL_UPLOAD_MB` | none | integer-like | validated by `validateEnv` | `utils/limits.js:109` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `OWNER_PDF_MAX_TOTAL_UPLOAD_MB` | none | integer-like | validated by `validateEnv` | `utils/limits.js:113` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `OWNER_TOOLS_MAX_DIMENSION_PX` | none | integer-like | validated by `validateEnv` | `utils/limits.js:118` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `OWNER_TOOLS_MAX_TOTAL_UPLOAD_MB` | none | integer-like | validated by `validateEnv` | `utils/limits.js:117` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `OWNER_TIMEOUT_MS` | none | integer-like | validated by `validateEnv` | `utils/limits.js:58` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `PDF_CONCURRENCY` | none | integer-like | parser fallback only | `routes/pdf-route.js:69` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `PDF_CONCURRENCY_WAIT_MS` | see usage line (inline fallback present) | string | none | `routes/pdf-route.js:70` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `PDF_MAX_PAGES_EXTRACT_IMAGES` | none | integer-like | parser fallback only | `routes/pdf-route.js:68` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `PDF_MAX_PAGES_SPLIT` | none | integer-like | parser fallback only | `routes/pdf-route.js:67` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `PDF_MAX_PAGES_TO_IMAGES` | none | integer-like | parser fallback only | `routes/pdf-route.js:66` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `PIXLAB_LOG_DIR` | see usage line (inline fallback present) | string | none | `utils/logger.js:20` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `PORT` | see usage line (inline fallback present) | integer-like | validated by `validateEnv` | `server.js:77`, `utils/monitoringSnapshot.js:60` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `PUBLIC_API_KEYS` | see usage line (inline fallback present) | string | none | `server.js:660` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | secret | — |
| `PUBLIC_FILE_TTL_HOURS` | none | integer-like | validated by `validateEnv` | `server.js:785` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `PUBLIC_H2I_DAILY_LIMIT` | none | integer-like | validated by `validateEnv` | `routes/h2i-route.js:62` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `PUBLIC_IMAGE_DAILY_LIMIT` | none | integer-like | validated by `validateEnv` | `routes/image-route.js:54` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `PUBLIC_IMAGE_MAX_DIMENSION_PX` | none | integer-like | validated by `validateEnv` | `utils/limits.js:90` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `PUBLIC_IMAGE_MAX_FILES_PER_REQ` | none | integer-like | validated by `validateEnv` | `utils/limits.js:88` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `PUBLIC_IMAGE_MAX_TOTAL_UPLOAD_MB` | none | integer-like | validated by `validateEnv` | `utils/limits.js:89` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `PUBLIC_PDF_DAILY_LIMIT` | none | integer-like | validated by `validateEnv` | `routes/pdf-route.js:65` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `PUBLIC_PDF_MAX_FILES_PER_REQ` | none | integer-like | validated by `validateEnv` | `utils/limits.js:93` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `PUBLIC_PDF_MAX_TOTAL_UPLOAD_MB` | none | integer-like | validated by `validateEnv` | `utils/limits.js:94` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `PUBLIC_TIMEOUT_MS` | none | integer-like | validated by `validateEnv` | `utils/limits.js:55` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `PUBLIC_TOOLS_DAILY_LIMIT` | none | integer-like | validated by `validateEnv` | `routes/tools-route.js:70` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `PUBLIC_TOOLS_MAX_DIMENSION_PX` | none | integer-like | validated by `validateEnv` | `utils/limits.js:100` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `PUBLIC_TOOLS_MAX_FILES_PER_REQ` | none | integer-like | validated by `validateEnv` | `utils/limits.js:98` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `PUBLIC_TOOLS_MAX_TOTAL_UPLOAD_MB` | none | integer-like | validated by `validateEnv` | `utils/limits.js:99` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `PUPPETEER_EXECUTABLE_PATH` | see usage line (inline fallback present) | string | none | `utils/monitoringSnapshot.js:320` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | sensitive | — |
| `PUPPETEER_NO_SANDBOX` | see usage line (inline fallback present) | boolean-like (`true/false/1/0`) | validated by `validateEnv` | `utils/config.js:74`, `utils/monitoringSnapshot.js:321` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `RATE_LIMITS_DAILY_RETENTION_ENABLED` | none | boolean-like (`true/false/1/0`) | validated by `validateEnv` | `utils/config.js:171` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `RATE_LIMITS_DAILY_RETENTION_DAYS` | none | integer-like | validated by `validateEnv` | `utils/config.js:176` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `RATE_LIMIT_DB_FAILURE_MODE` | see usage line (inline fallback present) | enum (lowercased) | validated by `validateEnv` enum list | `utils/config.js:97` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `RATE_LIMIT_FAIL_CLOSED` | none | boolean-like (`true/false/1/0`) | parser fallback only | `utils/config.js:104` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `REPRO_API_KEY` | see usage line (inline fallback present) | string | none | `scripts/repro-all-endpoints.js:6` | Script/tooling behavior only | same unless caller branches on NODE_ENV | secret | — |
| `REQUEST_LOG_SCHEMA_ENSURE_ON_STARTUP` | none | boolean-like (`true/false/1/0`) | parser fallback only | `utils/config.js:109` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `REQUIRE_SIGNED_OUTPUT_URLS` | none | boolean-like (`true/false/1/0`) | validated by `validateEnv` | `utils/config.js:48` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | sensitive | — |
| `DB_RETENTION_CLEANUP_ENABLED` | none | boolean-like (`true/false/1/0`) | validated by `validateEnv` | `server.js:85`, `utils/retentionCleanup.js:11` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `DB_RETENTION_LOG_PATH` | see usage line (inline fallback present) | string | none | `server.js:92`, `utils/retentionCleanup.js:18` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | sensitive | — |
| `REQUEST_LOG_RETENTION_DAYS` | see usage line (inline fallback present) | integer-like | validated by `validateEnv` | `server.js:88`, `utils/retentionCleanup.js:14` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `USAGE_MONTHLY_RETENTION_MONTHS` | see usage line (inline fallback present) | integer-like | validated by `validateEnv` | `server.js:89`, `utils/retentionCleanup.js:15` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `SIGNED_URL_ALGO` | see usage line (inline fallback present) | string | validated by `validateEnv` when signed output URLs are enabled (`sha256|sha384|sha512`) | `utils/config.js:56` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | sensitive | — |
| `SIGNED_URL_SECRET` | see usage line (inline fallback present) | string | required when signed output URLs are enabled (`validateEnv`; production always enabled) | `utils/config.js:54` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | secret | — |
| `SIGNED_URL_TTL_SECONDS` | none | integer-like | validated by `validateEnv` | `utils/config.js:55` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | sensitive | — |
| `SIMULATE_ALERT_EMAIL_RECIPIENTS` | none | string | none | `scripts/simulate-alert-notification.js:28` | Script/tooling behavior only | same unless caller branches on NODE_ENV | non-sensitive | — |
| `SIMULATE_ALERT_TELEGRAM_TARGETS` | none | string | none | `scripts/simulate-alert-notification.js:29` | Script/tooling behavior only | same unless caller branches on NODE_ENV | non-sensitive | — |
| `SNAPSHOT_FORCE_PORT` | none | string | none | `utils/monitoringSnapshot.js:54`, `utils/monitoringSnapshot.js:55` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `SUBSCRIPTION_BRIDGE_TOKEN` | see usage line (inline fallback present) | string | validated by `validateEnv` (always required) | `routes/subscription-route.js:2387`, `scripts/customer-key-smoke.js:3`, `scripts/simulate-alert-notification.js:24`, ... | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | secret | — |
| `SUPPORT_EMAIL` | see usage line (inline fallback present) | string | none | `utils/errorResponse.js:60` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `SUPPORT_URL` | see usage line (inline fallback present) | string | none | `utils/errorResponse.js:61` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | sensitive | — |
| `TEST_CUSTOMER_EMAIL` | see usage line (inline fallback present) | string | none | `scripts/customer-key-smoke.js:4`, `scripts/user-summary-smoke.js:4` | Script/tooling behavior only | same unless caller branches on NODE_ENV | non-sensitive | — |
| `TEST_PLAN_SLUG` | see usage line (inline fallback present) | string | none | `scripts/customer-key-smoke.js:5` | Script/tooling behavior only | same unless caller branches on NODE_ENV | non-sensitive | — |
| `TEST_SUBSCRIPTION_ID` | see usage line (inline fallback present) | string | none | `scripts/user-summary-smoke.js:5` | Script/tooling behavior only | same unless caller branches on NODE_ENV | non-sensitive | — |
| `TOOLS_CONCURRENCY` | none | integer-like | parser fallback only | `utils/config.js:140` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `TOOLS_CONCURRENCY_WAIT_MS` | none | integer-like | parser fallback only | `utils/config.js:141` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `TRUST_PROXY` | none | string | none | `utils/config.js:35`, `utils/validateEnv.js:173`, `utils/validateEnv.js:174` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `VALID_FROM_GRACE_SECONDS` | none | integer-like | validated by `validateEnv` | `utils/time.js:4` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | non-sensitive | — |
| `WEBSITE_URL` | see usage line (inline fallback present) | string | none | `utils/errorResponse.js:62` | Behavior referenced by code paths listed in details section | same unless caller branches on NODE_ENV | sensitive | — |

## A) Runtime env (affects server behavior)
- `ADMIN_AUDIT_LOG_ENABLED`
- `ADMIN_LOGIN_LOCK_MINUTES`
- `ADMIN_LOGIN_MAX_ATTEMPTS`
- `ADMIN_LOGIN_WINDOW_MINUTES`
- `ADMIN_PASS`
- `ADMIN_PASSWORD_HASH`
- `ADMIN_PATH`
- `ADMIN_SESSIONS_CLEANUP_INTERVAL_MS`
- `ADMIN_SESSIONS_RETENTION_DAYS`
- `ADMIN_SESSIONS_RETENTION_ENABLED`
- `ADMIN_SESSION_SECRET`
- `ADMIN_TOTP_SECRET`
- `ALERT_EMAIL_FROM`
- `ALERT_EMAIL_HOST`
- `ALERT_EMAIL_JSON_TRANSPORT`
- `ALERT_EMAIL_PASS`
- `ALERT_EMAIL_PORT`
- `ALERT_EMAIL_SECURE`
- `ALERT_EMAIL_USER`
- `ALERT_TELEGRAM_API_BASE_URL`
- `ALERT_TELEGRAM_BOT_TOKEN`
- `API_KEYS`
- `AUTO_RUN_MIGRATIONS`
- `BODY_PARSER_JSON_LIMIT`
- `BURST_LIMITS_WINDOW_RETENTION_ENABLED`
- `BURST_LIMITS_WINDOW_RETENTION_DAYS`
- `CORS_ORIGINS`
- `CUSTOMER_BURST_APPLIES_TO`
- `CUSTOMER_BURST_LIMIT_PER_MIN`
- `CUSTOMER_BURST_WINDOW_SECONDS`
- `DAVIX_DEBUG_INTERNAL`
- `DB_HOST`
- `DB_NAME`
- `DB_PASS`
- `DB_USER`
- `ENABLE_DIAGNOSTICS`
- `API_KEYS_EXPIRY_WATCHER_BATCH_SIZE`
- `API_KEYS_EXPIRY_WATCHER_ENABLED`
- `API_KEYS_EXPIRY_WATCHER_INTERVAL_MS`
- `GLOBAL_MAX_FILES_PER_REQ`
- `GLOBAL_MAX_TOTAL_UPLOAD_MB`
- `H2I_ALLOW_FILE_SCHEME`
- `H2I_BLOCK_PRIVATE_NETWORK`
- `H2I_CONCURRENCY`
- `H2I_CONCURRENCY_WAIT_MS`
- `H2I_DNS_REBINDING_MODE`
- `IMAGE_CONCURRENCY`
- `IMAGE_CONCURRENCY_WAIT_MS`
- `INTERNAL_BASE_URL`
- `INTERNAL_ALLOWED_IPS`
- `INTERNAL_RATE_LIMIT_PER_MIN`
- `INTERNAL_RATE_LIMIT_WINDOW_SECONDS`
- `QUOTA_LEDGER_CLEANUP_BATCH_SIZE`
- `QUOTA_LEDGER_CLEANUP_INTERVAL_DAYS`
- `QUOTA_LEDGER_ENABLED`
- `QUOTA_LEDGER_RECLAIM_BATCH_SIZE`
- `QUOTA_LEDGER_RECLAIM_INTERVAL_MS`
- `QUOTA_LEDGER_RETENTION_DAYS`
- `QUOTA_LEDGER_TTL_SECONDS`
- `MAX_HTML_CHARS`
- `MAX_RENDER_HEIGHT`
- `MAX_RENDER_PIXELS`
- `MAX_RENDER_WIDTH`
- `MAX_UPLOAD_BYTES`
- `NODE_ENV`
- `DB_ORPHAN_CLEANUP_ENABLED`
- `OUTPUT_CACHE_CONTROL`
- `OWNER_MAX_FILES_PER_REQ`
- `OWNER_TIMEOUT_MS`
- `PDF_CONCURRENCY`
- `PDF_CONCURRENCY_WAIT_MS`
- `PDF_MAX_PAGES_EXTRACT_IMAGES`
- `PDF_MAX_PAGES_SPLIT`
- `PDF_MAX_PAGES_TO_IMAGES`
- `PIXLAB_LOG_DIR`
- `PORT`
- `PUBLIC_API_KEYS`
- `PUBLIC_BASE_URL`
- `PUBLIC_FILE_TTL_HOURS`
- `PUBLIC_H2I_DAILY_LIMIT`
- `PUBLIC_IMAGE_DAILY_LIMIT`
- `PUBLIC_IMAGE_MAX_DIMENSION_PX`
- `PUBLIC_IMAGE_MAX_FILES_PER_REQ`
- `PUBLIC_IMAGE_MAX_TOTAL_UPLOAD_MB`
- `PUBLIC_PDF_DAILY_LIMIT`
- `PUBLIC_PDF_MAX_FILES_PER_REQ`
- `PUBLIC_PDF_MAX_TOTAL_UPLOAD_MB`
- `PUBLIC_TIMEOUT_MS`
- `PUBLIC_TOOLS_DAILY_LIMIT`
- `PUBLIC_TOOLS_MAX_DIMENSION_PX`
- `PUBLIC_TOOLS_MAX_FILES_PER_REQ`
- `PUBLIC_TOOLS_MAX_TOTAL_UPLOAD_MB`
- `PUPPETEER_EXECUTABLE_PATH`
- `PUPPETEER_NO_SANDBOX`
- `RATE_LIMITS_DAILY_RETENTION_ENABLED`
- `RATE_LIMITS_DAILY_RETENTION_DAYS`
- `RATE_LIMIT_DB_FAILURE_MODE`
- `RATE_LIMIT_FAIL_CLOSED`
- `REQUEST_LOG_SCHEMA_ENSURE_ON_STARTUP`
- `REQUIRE_SIGNED_OUTPUT_URLS`
- `DB_RETENTION_CLEANUP_ENABLED`
- `DB_RETENTION_LOG_PATH`
- `REQUEST_LOG_RETENTION_DAYS`
- `USAGE_MONTHLY_RETENTION_MONTHS`
- `SIGNED_URL_ALGO`
- `SIGNED_URL_SECRET`
- `SIGNED_URL_TTL_SECONDS`
- `SNAPSHOT_FORCE_PORT`
- `SNAPSHOT_BASE_URL`
- `SUBSCRIPTION_BRIDGE_TOKEN`
- `SUPPORT_EMAIL`
- `SUPPORT_URL`
- `TOOLS_CONCURRENCY`
- `TOOLS_CONCURRENCY_WAIT_MS`
- `TRUST_PROXY`
- `VALID_FROM_GRACE_SECONDS`
- `WEBSITE_URL`

## B) Validation-enforced env (`utils/validateEnv.js`)
- `ADMIN_AUDIT_LOG_ENABLED`
- `ADMIN_LOGIN_LOCK_MINUTES`
- `ADMIN_LOGIN_MAX_ATTEMPTS`
- `ADMIN_LOGIN_WINDOW_MINUTES`
- `ADMIN_PASS`
- `ADMIN_PASSWORD_HASH`
- `ADMIN_SESSION_SECRET`
- `ADMIN_TOTP_SECRET`
- `ALERT_EMAIL_PORT`
- `API_KEYS`
- `BURST_LIMITS_WINDOW_RETENTION_ENABLED`
- `BURST_LIMITS_WINDOW_RETENTION_DAYS`
- `CUSTOMER_BURST_APPLIES_TO`
- `CUSTOMER_BURST_LIMIT_PER_MIN`
- `CUSTOMER_BURST_WINDOW_SECONDS`
- `DB_HOST`
- `DB_NAME`
- `DB_USER`
- `API_KEYS_EXPIRY_WATCHER_BATCH_SIZE`
- `API_KEYS_EXPIRY_WATCHER_ENABLED`
- `API_KEYS_EXPIRY_WATCHER_INTERVAL_MS`
- `GLOBAL_MAX_FILES_PER_REQ`
- `GLOBAL_MAX_TOTAL_UPLOAD_MB`
- `H2I_ALLOW_FILE_SCHEME`
- `H2I_BLOCK_PRIVATE_NETWORK`
- `H2I_DNS_REBINDING_MODE`
- `MAX_HTML_CHARS`
- `MAX_RENDER_HEIGHT`
- `MAX_RENDER_PIXELS`
- `MAX_RENDER_WIDTH`
- `MAX_UPLOAD_BYTES`
- `DB_ORPHAN_CLEANUP_ENABLED`
- `OWNER_IMAGE_MAX_DIMENSION_PX`
- `OWNER_IMAGE_MAX_TOTAL_UPLOAD_MB`
- `OWNER_MAX_FILES_PER_REQ`
- `OWNER_PDF_MAX_TOTAL_UPLOAD_MB`
- `OWNER_TIMEOUT_MS`
- `OWNER_TOOLS_MAX_DIMENSION_PX`
- `OWNER_TOOLS_MAX_TOTAL_UPLOAD_MB`
- `PORT`
- `PUBLIC_FILE_TTL_HOURS`
- `PUBLIC_H2I_DAILY_LIMIT`
- `PUBLIC_IMAGE_DAILY_LIMIT`
- `PUBLIC_IMAGE_MAX_DIMENSION_PX`
- `PUBLIC_IMAGE_MAX_FILES_PER_REQ`
- `PUBLIC_IMAGE_MAX_TOTAL_UPLOAD_MB`
- `PUBLIC_PDF_DAILY_LIMIT`
- `PUBLIC_PDF_MAX_FILES_PER_REQ`
- `PUBLIC_PDF_MAX_TOTAL_UPLOAD_MB`
- `PUBLIC_TIMEOUT_MS`
- `PUBLIC_TOOLS_DAILY_LIMIT`
- `PUBLIC_TOOLS_MAX_DIMENSION_PX`
- `PUBLIC_TOOLS_MAX_FILES_PER_REQ`
- `PUBLIC_TOOLS_MAX_TOTAL_UPLOAD_MB`
- `PUPPETEER_NO_SANDBOX`
- `RATE_LIMITS_DAILY_RETENTION_ENABLED`
- `RATE_LIMITS_DAILY_RETENTION_DAYS`
- `RATE_LIMIT_DB_FAILURE_MODE`
- `REQUIRE_SIGNED_OUTPUT_URLS`
- `DB_RETENTION_CLEANUP_ENABLED`
- `REQUEST_LOG_RETENTION_DAYS`
- `USAGE_MONTHLY_RETENTION_MONTHS`
- `SIGNED_URL_SECRET`
- `SIGNED_URL_TTL_SECONDS`
- `SUBSCRIPTION_BRIDGE_TOKEN`
- `TRUST_PROXY`
- `VALID_FROM_GRACE_SECONDS`

## C) Script/tooling-only env
- `REPRO_API_KEY`
- `REPRO_BASE_URL`
- `SIMULATE_ALERT_EMAIL_RECIPIENTS`
- `SIMULATE_ALERT_TELEGRAM_TARGETS`
- `TEST_CUSTOMER_EMAIL`
- `TEST_PLAN_SLUG`
- `TEST_SUBSCRIPTION_ID`

## Detailed per-key sections

### `ADMIN_AUDIT_LOG_ENABLED`
- Evidence class: (B) env-configurable.
- Validation: present in `utils/validateEnv.js`.
- Usage evidence:
  - `utils/logger.js:130` via `parseBooleanEnv`: `return parseBooleanEnv('ADMIN_AUDIT_LOG_ENABLED', true);`
  - `utils/logger.js:297` via `parseBooleanEnv`: `enabled: parseBooleanEnv('ADMIN_AUDIT_LOG_ENABLED', true),`

### `ADMIN_LOGIN_LOCK_MINUTES`
- Evidence class: (B) env-configurable.
- Validation: present in `utils/validateEnv.js`.
- Usage evidence:
  - `utils/adminAuth.js:23` via `process.env`: `const lockMinutes = parseInt(process.env.ADMIN_LOGIN_LOCK_MINUTES, 10) || 15;`

### `ADMIN_LOGIN_MAX_ATTEMPTS`
- Evidence class: (B) env-configurable.
- Validation: present in `utils/validateEnv.js`.
- Usage evidence:
  - `utils/adminAuth.js:22` via `process.env`: `const maxAttempts = parseInt(process.env.ADMIN_LOGIN_MAX_ATTEMPTS, 10) || 5;`

### `ADMIN_LOGIN_WINDOW_MINUTES`
- Evidence class: (B) env-configurable.
- Validation: present in `utils/validateEnv.js`.
- Usage evidence:
  - `utils/adminAuth.js:21` via `process.env`: `const windowMinutes = parseInt(process.env.ADMIN_LOGIN_WINDOW_MINUTES, 10) || 15;`

### `ADMIN_PASS`
- Evidence class: (A) code-enforced + (B) env-configurable.
- Validation: present in `utils/validateEnv.js`; always required (all environments).
- Usage evidence:
  - `server.js:102` via `process.env`: `const adminPass = process.env.ADMIN_PASS || null;`
  - `server.js:108` via `process.env`: `if (!process.env.ADMIN_PASS && !isProduction()) {`


### `ADMIN_PASSWORD_HASH`
- Evidence class: (B) env-configurable.
- Validation: enforced by `validateEnv`; required in all environments (bcrypt hash only).
- Usage evidence:
  - `utils/adminAuth.js:59` via `process.env`: `const hash = process.env.ADMIN_PASSWORD_HASH || '';`

### `ADMIN_PATH`
- Evidence class: (B) env-configurable.
- Validation: none found.
- Usage evidence:
  - `server.js:101` via `process.env`: `const adminPath = process.env.ADMIN_PATH || 'acp';`

### `ADMIN_SESSIONS_RETENTION_ENABLED`
- Evidence class: (B) env-configurable.
- Validation: none found.
- Usage evidence:
  - `server.js:899` via `parseBooleanEnv`: `const adminSessionsCleanupEnabled = parseBooleanEnv('ADMIN_SESSIONS_RETENTION_ENABLED', true);`

- Evidence class: (B) env-configurable.
- Validation: none found.
- Usage evidence:

- Evidence class: (B) env-configurable.
- Validation: none found.
- Usage evidence:

### `ADMIN_SESSION_SECRET`
- Evidence class: (A) code-enforced + (B) env-configurable.
- Validation: present in `utils/validateEnv.js`; always required (all environments).
- Usage evidence:
  - `server.js:389` via `process.env`: `const adminSessionSecret = process.env.ADMIN_SESSION_SECRET;`
  - `utils/csrf.js:28` via `process.env`: `return req.app?.get?.('adminSessionSecret') || process.env.ADMIN_SESSION_SECRET || '';`

### `ADMIN_TOTP_SECRET`
- Evidence class: (A) code-enforced + (B) env-configurable.
- Validation: present in `utils/validateEnv.js`; always required (all environments).
- Usage evidence:
  - `utils/adminAuth.js:77` via `process.env`: `const secret = process.env.ADMIN_TOTP_SECRET || null;`

### `ALERT_EMAIL_FROM`
- Evidence class: (B) env-configurable.
- Validation: none found.
- Usage evidence:
  - `utils/alerts.js:178` via `process.env`: `const from = process.env.ALERT_EMAIL_FROM || 'pixlab@localhost';`

### `ALERT_EMAIL_HOST`
- Evidence class: (B) env-configurable.
- Validation: none found.
- Usage evidence:
  - `utils/alerts.js:162` via `process.env`: `const host = process.env.ALERT_EMAIL_HOST;`

### `ALERT_EMAIL_JSON_TRANSPORT`
- Evidence class: (B) env-configurable.
- Validation: none found.
- Usage evidence:
  - `utils/alerts.js:163` via `process.env`: `if (String(process.env.ALERT_EMAIL_JSON_TRANSPORT || '').toLowerCase() === 'true') {`
  - `scripts/test-alert-notification-pipeline.js:42` via `process.env`: `process.env.ALERT_EMAIL_JSON_TRANSPORT = 'true';`

### `ALERT_EMAIL_PASS`
- Evidence class: (B) env-configurable.
- Validation: none found.
- Usage evidence:
  - `utils/alerts.js:170` via `process.env`: `const pass = process.env.ALERT_EMAIL_PASS || null;`

### `ALERT_EMAIL_PORT`
- Evidence class: (B) env-configurable.
- Validation: present in `utils/validateEnv.js`.
- Usage evidence:
  - `utils/alerts.js:167` via `process.env`: `const port = parseInt(process.env.ALERT_EMAIL_PORT, 10) || 587;`

### `ALERT_EMAIL_SECURE`
- Evidence class: (B) env-configurable.
- Validation: none found.
- Usage evidence:
  - `utils/alerts.js:168` via `process.env`: `const secure = String(process.env.ALERT_EMAIL_SECURE || '').toLowerCase() === 'true';`

### `ALERT_EMAIL_USER`
- Evidence class: (B) env-configurable.
- Validation: none found.
- Usage evidence:
  - `utils/alerts.js:169` via `process.env`: `const user = process.env.ALERT_EMAIL_USER || null;`
  - `utils/alerts.js:178` via `process.env`: `const from = process.env.ALERT_EMAIL_FROM || 'pixlab@localhost';`

- Evidence class: (B) env-configurable.
- Validation: none found.
- Usage evidence:

### `ALERT_TELEGRAM_BOT_TOKEN`
- Evidence class: (B) env-configurable.
- Validation: none found.
- Usage evidence:
  - `utils/alerts.js:257` via `process.env`: `const token = process.env.ALERT_TELEGRAM_BOT_TOKEN;`
  - `utils/alerts.js:333` via `process.env`: `const token = process.env.ALERT_TELEGRAM_BOT_TOKEN;`
  - `scripts/test-alert-notification-pipeline.js:40` via `process.env`: `process.env.ALERT_TELEGRAM_BOT_TOKEN = 'test-token';`

### `API_KEYS`
- Evidence class: (A) code-enforced + (B) env-configurable.
- Validation: present in `utils/validateEnv.js`; required in production.
- Usage evidence:
  - `server.js:658` via `process.env`: `const allowedKeys = parseKeyList(process.env.API_KEYS || '');`

### `AUTO_RUN_MIGRATIONS`
- Evidence class: (B) env-configurable.
- Validation: none found.
- Usage evidence:
  - `utils/config.js:113` via `parseBooleanEnv`: `return parseBooleanEnv('AUTO_RUN_MIGRATIONS', true);`

- Evidence class: (B) env-configurable.
- Validation: none found.
- Usage evidence:

### `BODY_PARSER_JSON_LIMIT`
- Evidence class: (B) env-configurable.
- Validation: none found.
- Usage evidence:
  - `utils/limits.js:41` via `process.env`: `return process.env.BODY_PARSER_JSON_LIMIT || '20mb';`

### `BURST_LIMITS_WINDOW_RETENTION_ENABLED`
- Evidence class: (B) env-configurable.
- Validation: present in `utils/validateEnv.js`.
- Usage evidence:
  - `utils/config.js:181` via `parseBooleanEnv`: `return parseBooleanEnv('BURST_LIMITS_WINDOW_RETENTION_ENABLED', true);`

### `BURST_LIMITS_WINDOW_RETENTION_DAYS`
- Evidence class: (B) env-configurable.
- Validation: present in `utils/validateEnv.js`.
- Usage evidence:
  - `utils/config.js:186` via `parseIntEnv`: `const raw = parseIntEnv('BURST_LIMITS_WINDOW_RETENTION_DAYS', fallback);`

### `CORS_ORIGINS`
- Evidence class: (B) env-configurable.
- Validation: none found.
- Usage evidence:
  - `server.js:348` via `process.env`: `process.env.CORS_ORIGINS || 'https://h2i.davix.dev,https://davix.dev,https://www.davix.dev'`

### `CUSTOMER_BURST_APPLIES_TO`
- Evidence class: (B) env-configurable.
- Validation: present in `utils/validateEnv.js`.
- Usage evidence:
  - `utils/config.js:92` via `process.env`: `const raw = (process.env.CUSTOMER_BURST_APPLIES_TO || 'h2i').toString().trim().toLowerCase();`

### `CUSTOMER_BURST_LIMIT_PER_MIN`
- Evidence class: (B) env-configurable.
- Validation: present in `utils/validateEnv.js`.
- Usage evidence:
  - `utils/config.js:86` via `parseIntEnv`: `limitPerMin: parseIntEnv('CUSTOMER_BURST_LIMIT_PER_MIN', 0),`

### `CUSTOMER_BURST_WINDOW_SECONDS`
- Evidence class: (B) env-configurable.
- Validation: present in `utils/validateEnv.js`.
- Usage evidence:
  - `utils/config.js:87` via `parseIntEnv`: `windowSeconds: parseIntEnv('CUSTOMER_BURST_WINDOW_SECONDS', 60),`

### `DAVIX_DEBUG_INTERNAL`
- Evidence class: (B) env-configurable.
- Validation: none found.
- Usage evidence:
  - `utils/customerKeys.js:13` via `process.env`: `const debugInternal = process.env.DAVIX_DEBUG_INTERNAL === '1';`
  - `routes/h2i-route.js:71` via `process.env`: `const debugInternal = process.env.DAVIX_DEBUG_INTERNAL === '1';`
  - `routes/subscription-route.js:37` via `process.env`: `const debugInternal = process.env.DAVIX_DEBUG_INTERNAL === '1';`
  - `admin/adminRoutes.js:2186` via `process.env`: `if (process.env.DAVIX_DEBUG_INTERNAL !== '1') return;`
  - `admin/adminRoutes.js:2223` via `process.env`: `if (process.env.DAVIX_DEBUG_INTERNAL === '1' || durationMs > 2000) {`
  - `admin/adminRoutes.js:2731` via `process.env`: `stack: process.env.DAVIX_DEBUG_INTERNAL === '1' ? err?.stack : undefined,`

### `DB_HOST`
- Evidence class: (B) env-configurable.
- Validation: present in `utils/validateEnv.js`.
- Usage evidence:
  - `db.js:7` via `process.env`: `host: process.env.DB_HOST || 'localhost',`
  - `db.js:77` via `process.env`: `host: process.env.DB_HOST || 'localhost',`
  - `server.js:398` via `process.env`: `host: process.env.DB_HOST || 'localhost',`

### `DB_NAME`
- Evidence class: (B) env-configurable.
- Validation: present in `utils/validateEnv.js`.
- Usage evidence:
  - `db.js:10` via `process.env`: `database: process.env.DB_NAME || 'pixlab',`
  - `db.js:80` via `process.env`: `database: process.env.DB_NAME || 'pixlab',`
  - `server.js:401` via `process.env`: `database: process.env.DB_NAME || 'pixlab',`

### `DB_PASS`
- Evidence class: (B) env-configurable.
- Validation: none found.
- Usage evidence:
  - `db.js:9` via `process.env`: `password: process.env.DB_PASS || '',`
  - `db.js:79` via `process.env`: `password: process.env.DB_PASS || '',`
  - `server.js:400` via `process.env`: `password: process.env.DB_PASS || '',`

### `DB_USER`
- Evidence class: (B) env-configurable.
- Validation: present in `utils/validateEnv.js`.
- Usage evidence:
  - `db.js:8` via `process.env`: `user: process.env.DB_USER || 'root',`
  - `db.js:78` via `process.env`: `user: process.env.DB_USER || 'root',`
  - `server.js:399` via `process.env`: `user: process.env.DB_USER || 'root',`


### `ENABLE_DIAGNOSTICS`
- Evidence class: (B) env-configurable.
- Validation: none found.
- Usage evidence:
  - `utils/config.js:146` via `process.env`: `const raw = process.env.ENABLE_DIAGNOSTICS;`

### `API_KEYS_EXPIRY_WATCHER_BATCH_SIZE`
- Evidence class: (B) env-configurable.
- Validation: present in `utils/validateEnv.js`.
- Usage evidence:
  - `server.js:80` via `process.env`: `const expiryWatcherBatchSize = parseInt(process.env.API_KEYS_EXPIRY_WATCHER_BATCH_SIZE, 10) || 500;`

### `API_KEYS_EXPIRY_WATCHER_ENABLED`
- Evidence class: (B) env-configurable.
- Validation: present in `utils/validateEnv.js`.
- Usage evidence:
  - `server.js:78` via `process.env`: `const expiryWatcherEnabled = process.env.API_KEYS_EXPIRY_WATCHER_ENABLED !== 'false';`

### `API_KEYS_EXPIRY_WATCHER_INTERVAL_MS`
- Evidence class: (B) env-configurable.
- Validation: present in `utils/validateEnv.js`.
- Usage evidence:
  - `server.js:79` via `process.env`: `const expiryWatcherIntervalMs = parseInt(process.env.API_KEYS_EXPIRY_WATCHER_INTERVAL_MS, 10) || 10 * 60 * 1000;`

### `GLOBAL_MAX_FILES_PER_REQ`
- Evidence class: (B) env-configurable.
- Validation: present in `utils/validateEnv.js`.
- Usage evidence:
  - `utils/config.js:80` via `parseOptionalIntEnv`: `maxFilesPerReq: parseOptionalIntEnv('GLOBAL_MAX_FILES_PER_REQ'),`

### `GLOBAL_MAX_TOTAL_UPLOAD_MB`
- Evidence class: (B) env-configurable.
- Validation: present in `utils/validateEnv.js`.
- Usage evidence:
  - `utils/config.js:79` via `parseOptionalFloatEnv`: `maxTotalUploadMb: parseOptionalFloatEnv('GLOBAL_MAX_TOTAL_UPLOAD_MB'),`

### `H2I_ALLOW_FILE_SCHEME`
- Evidence class: (B) env-configurable.
- Validation: present in `utils/validateEnv.js`.
- Usage evidence:
  - `utils/config.js:68` via `parseBooleanEnv`: `allowFileScheme: parseBooleanEnv('H2I_ALLOW_FILE_SCHEME', false),`

### `H2I_BLOCK_PRIVATE_NETWORK`
- Evidence class: (B) env-configurable.
- Validation: present in `utils/validateEnv.js`.
- Usage evidence:
  - `utils/config.js:67` via `parseBooleanEnv`: `blockPrivateNetwork: parseBooleanEnv('H2I_BLOCK_PRIVATE_NETWORK', true),`
  - `utils/config.js:156` via `parseBooleanEnv`: `if (isProduction() && parseBooleanEnv('H2I_BLOCK_PRIVATE_NETWORK', true)) return 'strict';`

### `H2I_CONCURRENCY`
- Evidence class: (B) env-configurable.
- Validation: none found.
- Usage evidence:
  - `utils/config.js:124` via `parsePositiveIntEnv`: `concurrency: parsePositiveIntEnv('H2I_CONCURRENCY', defaultConcurrency),`

### `H2I_CONCURRENCY_WAIT_MS`
- Evidence class: (B) env-configurable.
- Validation: none found.
- Usage evidence:
  - `utils/config.js:125` via `parsePositiveIntEnv`: `waitMs: parsePositiveIntEnv('H2I_CONCURRENCY_WAIT_MS', 2000),`

### `H2I_DNS_REBINDING_MODE`
- Evidence class: (B) env-configurable.
- Validation: present in `utils/validateEnv.js`.
- Usage evidence:
  - `utils/config.js:154` via `process.env`: `const raw = (process.env.H2I_DNS_REBINDING_MODE || '').toString().trim().toLowerCase();`

### `IMAGE_CONCURRENCY`
- Evidence class: (B) env-configurable.
- Validation: none found.
- Usage evidence:
  - `utils/config.js:132` via `parsePositiveIntEnv`: `concurrency: parsePositiveIntEnv('IMAGE_CONCURRENCY', defaultConcurrency),`

### `IMAGE_CONCURRENCY_WAIT_MS`
- Evidence class: (B) env-configurable.
- Validation: none found.
- Usage evidence:
  - `utils/config.js:133` via `parsePositiveIntEnv`: `waitMs: parsePositiveIntEnv('IMAGE_CONCURRENCY_WAIT_MS', 2000),`

### `INTERNAL_ALLOWED_IPS`
- Evidence class: (A) code-enforced + (B) env-configurable.
- Validation: enforced by `validateEnv`; entries must be valid IP/CIDR values, and production requires non-empty list.
- Usage evidence:
  - `utils/internalAuth.js:9` via `process.env`: `return (process.env.INTERNAL_ALLOWED_IPS || '')`
  - `utils/validateEnv.js:103` via parser/validator: `const internalAllowlistEntries = parseInternalAllowlistEntries(process.env.INTERNAL_ALLOWED_IPS);`

### `INTERNAL_RATE_LIMIT_PER_MIN`
- Evidence class: (B) env-configurable.
- Validation: none found.
- Usage evidence:
  - `utils/internalAuth.js:71` via `process.env`: `const limit = Number.parseInt(process.env.INTERNAL_RATE_LIMIT_PER_MIN, 10) || 60;`

### `INTERNAL_RATE_LIMIT_WINDOW_SECONDS`
- Evidence class: (B) env-configurable.
- Validation: none found.
- Usage evidence:
  - `utils/internalAuth.js:72` via `process.env`: `const windowSeconds = Number.parseInt(process.env.INTERNAL_RATE_LIMIT_WINDOW_SECONDS, 10) || 60;`

### `QUOTA_LEDGER_CLEANUP_BATCH_SIZE`
- Evidence class: (B) env-configurable.
- Validation: none found.
- Usage evidence:
  - `utils/config.js:216` via `parsePositiveIntEnv`: `return parsePositiveIntEnv('QUOTA_LEDGER_CLEANUP_BATCH_SIZE', 5000);`

### `QUOTA_LEDGER_CLEANUP_INTERVAL_DAYS`
- Evidence class: (B) env-configurable.
- Validation: none found.
- Usage evidence:
  - `utils/config.js:208` via `parsePositiveIntEnv`: `return parsePositiveIntEnv('QUOTA_LEDGER_CLEANUP_INTERVAL_DAYS', 30);`

### `QUOTA_LEDGER_ENABLED`
- Evidence class: (B) env-configurable.
- Validation: none found.
- Usage evidence:
  - `utils/config.js:192` via `parseBooleanEnv`: `return parseBooleanEnv('QUOTA_LEDGER_ENABLED', defaultValue);`

### `QUOTA_LEDGER_RECLAIM_BATCH_SIZE`
- Evidence class: (B) env-configurable.
- Validation: none found.
- Usage evidence:
  - `utils/config.js:204` via `parsePositiveIntEnv`: `return parsePositiveIntEnv('QUOTA_LEDGER_RECLAIM_BATCH_SIZE', 500);`

### `QUOTA_LEDGER_RECLAIM_INTERVAL_MS`
- Evidence class: (B) env-configurable.
- Validation: none found.
- Usage evidence:
  - `utils/config.js:200` via `parsePositiveIntEnv`: `return parsePositiveIntEnv('QUOTA_LEDGER_RECLAIM_INTERVAL_MS', 10 * 60 * 1000);`

### `QUOTA_LEDGER_RETENTION_DAYS`
- Evidence class: (B) env-configurable.
- Validation: none found.
- Usage evidence:
  - `utils/config.js:212` via `parsePositiveIntEnv`: `return parsePositiveIntEnv('QUOTA_LEDGER_RETENTION_DAYS', 30);`

### `QUOTA_LEDGER_TTL_SECONDS`
- Evidence class: (B) env-configurable.
- Validation: none found.
- Usage evidence:
  - `utils/config.js:196` via `parsePositiveIntEnv`: `return parsePositiveIntEnv('QUOTA_LEDGER_TTL_SECONDS', 24 * 60 * 60);`

### `MAX_HTML_CHARS`
- Evidence class: (B) env-configurable.
- Validation: present in `utils/validateEnv.js`.
- Usage evidence:
  - `routes/h2i-route.js:63` via `process.env`: `const MAX_HTML_CHARS = parseInt(process.env.MAX_HTML_CHARS, 10) || 100_000;`

### `MAX_RENDER_HEIGHT`
- Evidence class: (B) env-configurable.
- Validation: present in `utils/validateEnv.js`.
- Usage evidence:
  - `routes/h2i-route.js:66` via `process.env`: `const MAX_RENDER_HEIGHT = parseInt(process.env.MAX_RENDER_HEIGHT, 10) || 8_000;`

### `MAX_RENDER_PIXELS`
- Evidence class: (B) env-configurable.
- Validation: present in `utils/validateEnv.js`.
- Usage evidence:
  - `routes/h2i-route.js:64` via `process.env`: `const MAX_RENDER_PIXELS = parseInt(process.env.MAX_RENDER_PIXELS, 10) || 20_000_000;`

### `MAX_RENDER_WIDTH`
- Evidence class: (B) env-configurable.
- Validation: present in `utils/validateEnv.js`.
- Usage evidence:
  - `routes/h2i-route.js:65` via `process.env`: `const MAX_RENDER_WIDTH = parseInt(process.env.MAX_RENDER_WIDTH, 10) || 5_000;`

### `MAX_UPLOAD_BYTES`
- Evidence class: (B) env-configurable.
- Validation: present in `utils/validateEnv.js`.
- Usage evidence:
  - `utils/limits.js:135` via `process.env`: `const parsedBytes = parseInt(process.env.MAX_UPLOAD_BYTES, 10);`

### `NODE_ENV`
- Evidence class: (B) env-configurable.
- Validation: none found.
- Usage evidence:
  - `utils/config.js:4` via `process.env`: `return process.env.NODE_ENV === 'production';`

- Evidence class: (B) env-configurable.
- Validation: present in `utils/validateEnv.js`.
- Usage evidence:

### `DB_ORPHAN_CLEANUP_ENABLED`
- Evidence class: (B) env-configurable.
- Validation: present in `utils/validateEnv.js`.
- Usage evidence:
  - `server.js:81` via `process.env`: `const orphanCleanupEnabled = process.env.DB_ORPHAN_CLEANUP_ENABLED !== 'false';`

- Evidence class: (B) env-configurable.
- Validation: present in `utils/validateEnv.js`.
- Usage evidence:

- Evidence class: (B) env-configurable.
- Validation: present in `utils/validateEnv.js`.
- Usage evidence:

### `OUTPUT_CACHE_CONTROL`
- Evidence class: (B) env-configurable.
- Validation: none found.
- Usage evidence:
  - `utils/config.js:57` via `process.env`: `cacheControl: process.env.OUTPUT_CACHE_CONTROL || 'private, no-store',`

### `OWNER_MAX_FILES_PER_REQ`
- Evidence class: (B) env-configurable.
- Validation: present in `utils/validateEnv.js`.
- Usage evidence:
  - `utils/limits.js:124` via `parseIntEnv`: `const maxFilesOverride = parseIntEnv('OWNER_MAX_FILES_PER_REQ', null);`

### `OWNER_IMAGE_MAX_DIMENSION_PX`
- Evidence class: (B) env-configurable.
- Validation: present in `utils/validateEnv.js`.
- Usage evidence:
  - `utils/limits.js:110` via `env map`: `dimension: 'OWNER_IMAGE_MAX_DIMENSION_PX',`

### `OWNER_IMAGE_MAX_TOTAL_UPLOAD_MB`
- Evidence class: (B) env-configurable.
- Validation: present in `utils/validateEnv.js`.
- Usage evidence:
  - `utils/limits.js:109` via `env map`: `total: 'OWNER_IMAGE_MAX_TOTAL_UPLOAD_MB',`

### `OWNER_PDF_MAX_TOTAL_UPLOAD_MB`
- Evidence class: (B) env-configurable.
- Validation: present in `utils/validateEnv.js`.
- Usage evidence:
  - `utils/limits.js:113` via `env map`: `total: 'OWNER_PDF_MAX_TOTAL_UPLOAD_MB',`

### `OWNER_TOOLS_MAX_DIMENSION_PX`
- Evidence class: (B) env-configurable.
- Validation: present in `utils/validateEnv.js`.
- Usage evidence:
  - `utils/limits.js:118` via `env map`: `dimension: 'OWNER_TOOLS_MAX_DIMENSION_PX',`

### `OWNER_TOOLS_MAX_TOTAL_UPLOAD_MB`
- Evidence class: (B) env-configurable.
- Validation: present in `utils/validateEnv.js`.
- Usage evidence:
  - `utils/limits.js:117` via `env map`: `total: 'OWNER_TOOLS_MAX_TOTAL_UPLOAD_MB',`

### `OWNER_TIMEOUT_MS`
- Evidence class: (B) env-configurable.
- Validation: present in `utils/validateEnv.js`.
- Usage evidence:
  - `utils/limits.js:58` via `parseIntEnv`: `return parseIntEnv('OWNER_TIMEOUT_MS', 300_000);`

### `PDF_CONCURRENCY`
- Evidence class: (B) env-configurable.
- Validation: none found.
- Usage evidence:
  - `routes/pdf-route.js:69` via `parseConcurrencyEnv`: `const PDF_CONCURRENCY = parseConcurrencyEnv('PDF_CONCURRENCY', isProduction() ? 2 : 4);`

### `PDF_CONCURRENCY_WAIT_MS`
- Evidence class: (B) env-configurable.
- Validation: none found.
- Usage evidence:
  - `routes/pdf-route.js:70` via `process.env`: `const PDF_CONCURRENCY_WAIT_MS = parseInt(process.env.PDF_CONCURRENCY_WAIT_MS, 10) || 15000;`

### `PDF_MAX_PAGES_EXTRACT_IMAGES`
- Evidence class: (B) env-configurable.
- Validation: none found.
- Usage evidence:
  - `routes/pdf-route.js:68` via `parsePageLimitEnv`: `const PDF_MAX_PAGES_EXTRACT_IMAGES = parsePageLimitEnv('PDF_MAX_PAGES_EXTRACT_IMAGES', isProduction() ? 50 : 200);`

### `PDF_MAX_PAGES_SPLIT`
- Evidence class: (B) env-configurable.
- Validation: none found.
- Usage evidence:
  - `routes/pdf-route.js:67` via `parsePageLimitEnv`: `const PDF_MAX_PAGES_SPLIT = parsePageLimitEnv('PDF_MAX_PAGES_SPLIT', 200);`

### `PDF_MAX_PAGES_TO_IMAGES`
- Evidence class: (B) env-configurable.
- Validation: none found.
- Usage evidence:
  - `routes/pdf-route.js:66` via `parsePageLimitEnv`: `const PDF_MAX_PAGES_TO_IMAGES = parsePageLimitEnv('PDF_MAX_PAGES_TO_IMAGES', isProduction() ? 50 : 200);`

### `PIXLAB_LOG_DIR`
- Evidence class: (B) env-configurable.
- Validation: none found.
- Usage evidence:
  - `utils/logger.js:20` via `process.env`: `const envDir = (process.env.PIXLAB_LOG_DIR || '').trim();`

### `PORT`
- Evidence class: (B) env-configurable.
- Validation: present in `utils/validateEnv.js`.
- Usage evidence:
  - `server.js:77` via `process.env`: `const PORT = process.env.PORT || 3005;`
  - `utils/monitoringSnapshot.js:60` via `process.env`: `const port = process.env.PORT || 3005;`

### `PUBLIC_API_KEYS`
- Evidence class: (B) env-configurable.
- Validation: none found.
- Usage evidence:
  - `server.js:660` via `process.env`: `const publicKeys = parseKeyList(process.env.PUBLIC_API_KEYS || '');`

- Evidence class: (B) env-configurable.
- Validation: present in `utils/validateEnv.js`.
- Usage evidence:

### `PUBLIC_FILE_TTL_HOURS`
- Evidence class: (B) env-configurable.
- Validation: present in `utils/validateEnv.js`.
- Usage evidence:
  - `server.js:785` via `process.env`: `const parsedPublicFileTtlHours = parseInt(process.env.PUBLIC_FILE_TTL_HOURS, 10);`

### `PUBLIC_H2I_DAILY_LIMIT`
- Evidence class: (B) env-configurable.
- Validation: present in `utils/validateEnv.js`.
- Usage evidence:
  - `routes/h2i-route.js:62` via `parseDailyLimitEnv`: `const H2I_DAILY_LIMIT = parseDailyLimitEnv('PUBLIC_H2I_DAILY_LIMIT', 5);`

### `PUBLIC_IMAGE_DAILY_LIMIT`
- Evidence class: (B) env-configurable.
- Validation: present in `utils/validateEnv.js`.
- Usage evidence:
  - `routes/image-route.js:54` via `parseDailyLimitEnv`: `const IMAGE_DAILY_LIMIT = parseDailyLimitEnv('PUBLIC_IMAGE_DAILY_LIMIT', 10);`

### `PUBLIC_IMAGE_MAX_DIMENSION_PX`
- Evidence class: (B) env-configurable.
- Validation: present in `utils/validateEnv.js`.
- Usage evidence:
  - `utils/limits.js:90` via `parseIntEnv`: `maxDimensionPx: parseIntEnv('PUBLIC_IMAGE_MAX_DIMENSION_PX', 6000),`

### `PUBLIC_IMAGE_MAX_FILES_PER_REQ`
- Evidence class: (B) env-configurable.
- Validation: present in `utils/validateEnv.js`.
- Usage evidence:
  - `utils/limits.js:88` via `parseIntEnv`: `maxFiles: parseIntEnv('PUBLIC_IMAGE_MAX_FILES_PER_REQ', 10),`

### `PUBLIC_IMAGE_MAX_TOTAL_UPLOAD_MB`
- Evidence class: (B) env-configurable.
- Validation: present in `utils/validateEnv.js`.
- Usage evidence:
  - `utils/limits.js:89` via `parseIntEnv`: `maxTotalUploadMb: parseIntEnv('PUBLIC_IMAGE_MAX_TOTAL_UPLOAD_MB', 10),`

### `PUBLIC_PDF_DAILY_LIMIT`
- Evidence class: (B) env-configurable.
- Validation: present in `utils/validateEnv.js`.
- Usage evidence:
  - `routes/pdf-route.js:65` via `parseDailyLimitEnv`: `const PDF_DAILY_LIMIT = parseDailyLimitEnv('PUBLIC_PDF_DAILY_LIMIT', 10);`

### `PUBLIC_PDF_MAX_FILES_PER_REQ`
- Evidence class: (B) env-configurable.
- Validation: present in `utils/validateEnv.js`.
- Usage evidence:
  - `utils/limits.js:93` via `parseIntEnv`: `maxFiles: parseIntEnv('PUBLIC_PDF_MAX_FILES_PER_REQ', 10),`

### `PUBLIC_PDF_MAX_TOTAL_UPLOAD_MB`
- Evidence class: (B) env-configurable.
- Validation: present in `utils/validateEnv.js`.
- Usage evidence:
  - `utils/limits.js:94` via `parseIntEnv`: `maxTotalUploadMb: parseIntEnv('PUBLIC_PDF_MAX_TOTAL_UPLOAD_MB', 10),`

### `PUBLIC_TIMEOUT_MS`
- Evidence class: (B) env-configurable.
- Validation: present in `utils/validateEnv.js`.
- Usage evidence:
  - `utils/limits.js:55` via `parseIntEnv`: `return parseIntEnv('PUBLIC_TIMEOUT_MS', 30_000);`

### `PUBLIC_TOOLS_DAILY_LIMIT`
- Evidence class: (B) env-configurable.
- Validation: present in `utils/validateEnv.js`.
- Usage evidence:
  - `routes/tools-route.js:70` via `parseDailyLimitEnv`: `const TOOLS_DAILY_LIMIT = parseDailyLimitEnv('PUBLIC_TOOLS_DAILY_LIMIT', 10);`

### `PUBLIC_TOOLS_MAX_DIMENSION_PX`
- Evidence class: (B) env-configurable.
- Validation: present in `utils/validateEnv.js`.
- Usage evidence:
  - `utils/limits.js:100` via `parseIntEnv`: `maxDimensionPx: parseIntEnv('PUBLIC_TOOLS_MAX_DIMENSION_PX', 6000),`

### `PUBLIC_TOOLS_MAX_FILES_PER_REQ`
- Evidence class: (B) env-configurable.
- Validation: present in `utils/validateEnv.js`.
- Usage evidence:
  - `utils/limits.js:98` via `parseIntEnv`: `maxFiles: parseIntEnv('PUBLIC_TOOLS_MAX_FILES_PER_REQ', 10),`

### `PUBLIC_TOOLS_MAX_TOTAL_UPLOAD_MB`
- Evidence class: (B) env-configurable.
- Validation: present in `utils/validateEnv.js`.
- Usage evidence:
  - `utils/limits.js:99` via `parseIntEnv`: `maxTotalUploadMb: parseIntEnv('PUBLIC_TOOLS_MAX_TOTAL_UPLOAD_MB', 10),`

### `PUPPETEER_EXECUTABLE_PATH`
- Evidence class: (B) env-configurable.
- Validation: none found.
- Usage evidence:
  - `utils/monitoringSnapshot.js:320` via `process.env`: `env_puppeteer_executable_path: process.env.PUPPETEER_EXECUTABLE_PATH || null,`

### `PUPPETEER_NO_SANDBOX`
- Evidence class: (B) env-configurable.
- Validation: present in `utils/validateEnv.js`.
- Usage evidence:
  - `utils/config.js:74` via `parseBooleanEnv`: `return parseBooleanEnv('PUPPETEER_NO_SANDBOX', !isProd);`
  - `utils/monitoringSnapshot.js:321` via `process.env`: `env_puppeteer_no_sandbox: process.env.PUPPETEER_NO_SANDBOX || null,`

### `RATE_LIMITS_DAILY_RETENTION_ENABLED`
- Evidence class: (B) env-configurable.
- Validation: present in `utils/validateEnv.js`.
- Usage evidence:
  - `utils/config.js:171` via `parseBooleanEnv`: `return parseBooleanEnv('RATE_LIMITS_DAILY_RETENTION_ENABLED', true);`

### `RATE_LIMITS_DAILY_RETENTION_DAYS`
- Evidence class: (B) env-configurable.
- Validation: present in `utils/validateEnv.js`.
- Usage evidence:
  - `utils/config.js:176` via `parseIntEnv`: `const raw = parseIntEnv('RATE_LIMITS_DAILY_RETENTION_DAYS', fallback);`

### `RATE_LIMIT_DB_FAILURE_MODE`
- Evidence class: (B) env-configurable.
- Validation: present in `utils/validateEnv.js`.
- Usage evidence:
  - `utils/config.js:97` via `process.env`: `const raw = (process.env.RATE_LIMIT_DB_FAILURE_MODE || 'memory').toString().trim().toLowerCase();`

### `RATE_LIMIT_FAIL_CLOSED`
- Evidence class: (B) env-configurable.
- Validation: none found.
- Usage evidence:
  - `utils/config.js:104` via `parseBooleanEnv`: `return parseBooleanEnv('RATE_LIMIT_FAIL_CLOSED', false);`

### `REPRO_API_KEY`
- Evidence class: (B) env-configurable.
- Scope: script/tooling only.
- Validation: none found.
- Usage evidence:
  - `scripts/repro-all-endpoints.js:6` via `process.env`: `const apiKey = process.env.REPRO_API_KEY;`

- Evidence class: (B) env-configurable.
- Scope: script/tooling only.
- Validation: none found.
- Usage evidence:

### `REQUEST_LOG_SCHEMA_ENSURE_ON_STARTUP`
- Evidence class: (B) env-configurable.
- Validation: none found.
- Usage evidence:
  - `utils/config.js:109` via `parseBooleanEnv`: `return parseBooleanEnv('REQUEST_LOG_SCHEMA_ENSURE_ON_STARTUP', defaultValue);`

### `REQUIRE_SIGNED_OUTPUT_URLS`
- Evidence class: (B) env-configurable.
- Validation: present in `utils/validateEnv.js`.
- Usage evidence:
  - `utils/config.js:48` via `parseBooleanEnv`: `return parseBooleanEnv('REQUIRE_SIGNED_OUTPUT_URLS', defaultValue);`

- Evidence class: (B) env-configurable.
- Validation: present in `utils/validateEnv.js`.
- Usage evidence:

- Evidence class: (B) env-configurable.
- Validation: present in `utils/validateEnv.js`.
- Usage evidence:

### `DB_RETENTION_CLEANUP_ENABLED`
- Evidence class: (B) env-configurable.
- Validation: present in `utils/validateEnv.js`.
- Usage evidence:
  - `server.js:85` via `process.env`: `const retentionCleanupEnabled = process.env.DB_RETENTION_CLEANUP_ENABLED !== 'false';`
  - `utils/retentionCleanup.js:11` via `process.env`: `const DEFAULT_ENABLED = process.env.DB_RETENTION_CLEANUP_ENABLED !== 'false';`

- Evidence class: (B) env-configurable.
- Validation: present in `utils/validateEnv.js`.
- Usage evidence:

- Evidence class: (B) env-configurable.
- Validation: present in `utils/validateEnv.js`.
- Usage evidence:

### `DB_RETENTION_LOG_PATH`
- Evidence class: (B) env-configurable.
- Validation: none found.
- Usage evidence:
  - `server.js:92` via `process.env`: `const retentionLogPath = process.env.DB_RETENTION_LOG_PATH || null;`
  - `utils/retentionCleanup.js:18` via `process.env`: `const DEFAULT_LOG_PATH = process.env.DB_RETENTION_LOG_PATH || null;`

### `REQUEST_LOG_RETENTION_DAYS`
- Evidence class: (B) env-configurable.
- Validation: present in `utils/validateEnv.js`.
- Usage evidence:
  - `server.js:88` via `process.env`: `const retentionRequestLogDays = parseInt(process.env.REQUEST_LOG_RETENTION_DAYS, 10) || 60;`
  - `utils/retentionCleanup.js:14` via `process.env`: `const DEFAULT_REQUEST_LOG_DAYS = parseInt(process.env.REQUEST_LOG_RETENTION_DAYS, 10) || 60;`

### `USAGE_MONTHLY_RETENTION_MONTHS`
- Evidence class: (B) env-configurable.
- Validation: present in `utils/validateEnv.js`.
- Usage evidence:
  - `server.js:89` via `process.env`: `const retentionUsageMonthlyMonths = parseInt(process.env.USAGE_MONTHLY_RETENTION_MONTHS, 10) || 6;`
  - `utils/retentionCleanup.js:15` via `process.env`: `const DEFAULT_USAGE_MONTHS = parseInt(process.env.USAGE_MONTHLY_RETENTION_MONTHS, 10) || 6;`

### `SIGNED_URL_ALGO`
- Evidence class: (B) env-configurable.
- Validation: none found.
- Usage evidence:
  - `utils/config.js:56` via `process.env`: `algo: process.env.SIGNED_URL_ALGO || 'sha256',`

### `SIGNED_URL_SECRET`
- Evidence class: (B) env-configurable.
- Validation: present in `utils/validateEnv.js`.
- Usage evidence:
  - `utils/config.js:54` via `process.env`: `secret: process.env.SIGNED_URL_SECRET || '',`

### `SIGNED_URL_TTL_SECONDS`
- Evidence class: (B) env-configurable.
- Validation: present in `utils/validateEnv.js`.
- Usage evidence:
  - `utils/config.js:55` via `parseIntEnv`: `ttlSeconds: parseIntEnv('SIGNED_URL_TTL_SECONDS', DEFAULT_SIGNED_URL_TTL_SECONDS),`

### `SIMULATE_ALERT_EMAIL_RECIPIENTS`
- Evidence class: (B) env-configurable.
- Scope: script/tooling only.
- Validation: none found.
- Usage evidence:
  - `scripts/simulate-alert-notification.js:28` via `process.env`: `const emailRecipients = parseList(process.env.SIMULATE_ALERT_EMAIL_RECIPIENTS);`

### `SIMULATE_ALERT_TELEGRAM_TARGETS`
- Evidence class: (B) env-configurable.
- Scope: script/tooling only.
- Validation: none found.
- Usage evidence:
  - `scripts/simulate-alert-notification.js:29` via `process.env`: `const telegramTargets = parseList(process.env.SIMULATE_ALERT_TELEGRAM_TARGETS);`

- Evidence class: (B) env-configurable.
- Validation: none found.
- Usage evidence:

### `SNAPSHOT_FORCE_PORT`
- Evidence class: (B) env-configurable.
- Validation: none found.
- Usage evidence:
  - `utils/monitoringSnapshot.js:54` via `process.env`: `if (host && !host.includes(':') && process.env.SNAPSHOT_FORCE_PORT) {`
  - `utils/monitoringSnapshot.js:55` via `process.env`: `host = `${host}:${process.env.SNAPSHOT_FORCE_PORT}`;`

### `SUBSCRIPTION_BRIDGE_TOKEN`
- Evidence class: (B) env-configurable.
- Validation: present in `utils/validateEnv.js`.
- Usage evidence:
  - `utils/internalAuth.js:26` via `process.env`: `process.env.SUBSCRIPTION_BRIDGE_TOKEN &&`
  - `utils/internalAuth.js:28` via `process.env`: `safeTokenEquals(bridgeToken, process.env.SUBSCRIPTION_BRIDGE_TOKEN)`
  - `utils/internalAuth.js:33` via `process.env`: `const bridgeToken = process.env.SUBSCRIPTION_BRIDGE_TOKEN;`
  - `utils/monitoringSnapshot.js:76` via `process.env`: `if (process.env.SUBSCRIPTION_BRIDGE_TOKEN) {`
  - `utils/monitoringSnapshot.js:77` via `process.env`: `headers['x-davix-bridge-token'] = process.env.SUBSCRIPTION_BRIDGE_TOKEN;`
  - `utils/monitoringSnapshot.js:265` via `process.env`: `const token = process.env.SUBSCRIPTION_BRIDGE_TOKEN || '';`
  - `utils/alerts.js:508` via `process.env`: `if (process.env.SUBSCRIPTION_BRIDGE_TOKEN) {`
  - `utils/alerts.js:509` via `process.env`: `headers['x-davix-bridge-token'] = process.env.SUBSCRIPTION_BRIDGE_TOKEN;`
  - ... plus 5 additional occurrence(s).

- Evidence class: (B) env-configurable.
- Validation: none found.
- Usage evidence:

### `SUPPORT_EMAIL`
- Evidence class: (B) env-configurable.
- Validation: none found.
- Usage evidence:
  - `utils/errorResponse.js:60` via `process.env`: `const email = (process.env.SUPPORT_EMAIL || '').trim();`

### `SUPPORT_URL`
- Evidence class: (B) env-configurable.
- Validation: none found.
- Usage evidence:
  - `utils/errorResponse.js:61` via `process.env`: `const url = (process.env.SUPPORT_URL || '').trim();`

### `TEST_CUSTOMER_EMAIL`
- Evidence class: (B) env-configurable.
- Scope: script/tooling only.
- Validation: none found.
- Usage evidence:
  - `scripts/customer-key-smoke.js:4` via `process.env`: `const customerEmail = process.env.TEST_CUSTOMER_EMAIL || 'test@example.com';`
  - `scripts/user-summary-smoke.js:4` via `process.env`: `const customerEmail = process.env.TEST_CUSTOMER_EMAIL || 'test@example.com';`

### `TEST_PLAN_SLUG`
- Evidence class: (B) env-configurable.
- Scope: script/tooling only.
- Validation: none found.
- Usage evidence:
  - `scripts/customer-key-smoke.js:5` via `process.env`: `const planSlug = process.env.TEST_PLAN_SLUG || 'dev-plan';`

### `TEST_SUBSCRIPTION_ID`
- Evidence class: (B) env-configurable.
- Scope: script/tooling only.
- Validation: none found.
- Usage evidence:
  - `scripts/user-summary-smoke.js:5` via `process.env`: `const subscriptionId = process.env.TEST_SUBSCRIPTION_ID || null;`

### `TOOLS_CONCURRENCY`
- Evidence class: (B) env-configurable.
- Validation: none found.
- Usage evidence:
  - `utils/config.js:140` via `parsePositiveIntEnv`: `concurrency: parsePositiveIntEnv('TOOLS_CONCURRENCY', defaultConcurrency),`

### `TOOLS_CONCURRENCY_WAIT_MS`
- Evidence class: (B) env-configurable.
- Validation: none found.
- Usage evidence:
  - `utils/config.js:141` via `parsePositiveIntEnv`: `waitMs: parsePositiveIntEnv('TOOLS_CONCURRENCY_WAIT_MS', 2000),`

### `TRUST_PROXY`
- Evidence class: (B) env-configurable.
- Validation: present in `utils/validateEnv.js`.
- Usage evidence:
  - `utils/config.js:35` via `process.env`: `const raw = process.env.TRUST_PROXY;`
  - `utils/validateEnv.js:173` via `process.env`: `if (hasValue(process.env.TRUST_PROXY)) {`
  - `utils/validateEnv.js:174` via `process.env`: `const raw = String(process.env.TRUST_PROXY).trim().toLowerCase();`

### `VALID_FROM_GRACE_SECONDS`
- Evidence class: (B) env-configurable.
- Validation: present in `utils/validateEnv.js`.
- Usage evidence:
  - `utils/time.js:4` via `process.env`: `const parsed = Number(process.env.VALID_FROM_GRACE_SECONDS);`

### `WEBSITE_URL`
- Evidence class: (B) env-configurable.
- Validation: none found.
- Usage evidence:
  - `utils/errorResponse.js:62` via `process.env`: `const website = (process.env.WEBSITE_URL || '').trim();`

## Coverage
- Ripgrep patterns used:
  - `rg -n "process\.env(\.|\[)" .`
  - `rg -n "(parseBooleanEnv|get[A-Za-z0-9_]+Config|validateEnv|isProduction|ENV)" utils routes server.js scripts admin db.js usage.js .`
- Files scanned (env hits):
  - `admin/adminRoutes.js`
  - `db.js`
  - `routes/h2i-route.js`
  - `routes/image-route.js`
  - `routes/pdf-route.js`
  - `routes/subscription-route.js`
  - `routes/tools-route.js`
  - `scripts/customer-key-smoke.js`
  - `scripts/repro-all-endpoints.js`
  - `scripts/simulate-alert-notification.js`
  - `scripts/test-alert-notification-pipeline.js`
  - `scripts/user-summary-smoke.js`
  - `server.js`
  - `utils/adminAuth.js`
  - `utils/alerts.js`
  - `utils/burstLimitMiddleware.js`
  - `utils/config.js`
  - `utils/csrf.js`
  - `utils/csrfDebug.js`
  - `utils/customerKeys.js`
  - `utils/errorResponse.js`
  - `utils/internalAuth.js`
  - `utils/limits.js`
  - `utils/logger.js`
  - `utils/monitoringSnapshot.js`
  - `utils/orphanCleanup.js`
  - `utils/requestLog.js`
  - `utils/retentionCleanup.js`
  - `utils/signedUrls.js`
  - `utils/time.js`
  - `utils/validateEnv.js`
- Counts: total env keys found = 137; runtime keys = 129; script-only keys = 8.
- Known unknowns:
  - Some controls are indirect through helper wrappers (for example `parseIntEnv(name, fallback)` in `utils/limits.js`), so semantic descriptions rely on call-site names when no explicit comment exists.
  - Keys present only in validation arrays (`utils/validateEnv.js`) may not be consumed on active runtime paths in this snapshot; they are still cataloged as supported because startup validation accepts/rejects them.


## 2026-02-27 addendum: retention/file-cleanup/internal-rate env coverage

This addendum documents env keys that were previously under-documented in this file. It is code-sourced from `server.js`, `utils/retentionCleanup.js`, `utils/orphanCleanup.js`, `utils/subscriptionEventsCleanup.js`, `utils/adminSessionsCleanup.js`, `utils/alertRetentionCleanup.js`, and `utils/monitoringSnapshot.js`.

| ENV key | Default | Required | Validation/allowed | Security notes | Example |
|---|---:|---|---|---|---|
| `REQUEST_LOG_CLEANUP_INTERVAL_MS` | `86400000` | optional | int `>=1000` | Cleanup cadence only | `REQUEST_LOG_CLEANUP_INTERVAL_MS=86400000` |
| `REQUEST_LOG_CLEANUP_INITIAL_DELAY_MS` | `60000` | optional | int `>=1000` | Cleanup cadence only | `REQUEST_LOG_CLEANUP_INITIAL_DELAY_MS=60000` |
| `REQUEST_LOG_CLEANUP_BATCH_SIZE` | `20000` | optional | int `>=1` | DB delete batch size | `REQUEST_LOG_CLEANUP_BATCH_SIZE=20000` |
| `USAGE_MONTHLY_CLEANUP_INTERVAL_MS` | `86400000` | optional | int `>=1000` | Cleanup cadence only | `USAGE_MONTHLY_CLEANUP_INTERVAL_MS=86400000` |
| `USAGE_MONTHLY_CLEANUP_INITIAL_DELAY_MS` | `60000` | optional | int `>=1000` | Cleanup cadence only | `USAGE_MONTHLY_CLEANUP_INITIAL_DELAY_MS=60000` |
| `USAGE_MONTHLY_CLEANUP_BATCH_SIZE` | `5000` | optional | int `>=1` | DB delete batch size | `USAGE_MONTHLY_CLEANUP_BATCH_SIZE=5000` |
| `RATE_LIMITS_DAILY_CLEANUP_INTERVAL_MS` | `86400000` | optional | int `>=1000` | Cleanup cadence only | `RATE_LIMITS_DAILY_CLEANUP_INTERVAL_MS=86400000` |
| `RATE_LIMITS_DAILY_CLEANUP_INITIAL_DELAY_MS` | `60000` | optional | int `>=1000` | Cleanup cadence only | `RATE_LIMITS_DAILY_CLEANUP_INITIAL_DELAY_MS=60000` |
| `RATE_LIMITS_DAILY_CLEANUP_BATCH_SIZE` | `5000` | optional | int `>=1` | DB delete batch size | `RATE_LIMITS_DAILY_CLEANUP_BATCH_SIZE=5000` |
| `BURST_LIMITS_WINDOW_CLEANUP_INTERVAL_MS` | `86400000` | optional | int `>=1000` | Cleanup cadence only | `BURST_LIMITS_WINDOW_CLEANUP_INTERVAL_MS=86400000` |
| `BURST_LIMITS_WINDOW_CLEANUP_INITIAL_DELAY_MS` | `60000` | optional | int `>=1000` | Cleanup cadence only | `BURST_LIMITS_WINDOW_CLEANUP_INITIAL_DELAY_MS=60000` |
| `BURST_LIMITS_WINDOW_CLEANUP_BATCH_SIZE` | `5000` | optional | int `>=1` | DB delete batch size | `BURST_LIMITS_WINDOW_CLEANUP_BATCH_SIZE=5000` |
| `INTERNAL_RATE_LIMIT_WINDOWS_RETENTION_DAYS` | `1` | optional | int `>=1` | Internal limiter data retention | `INTERNAL_RATE_LIMIT_WINDOWS_RETENTION_DAYS=1` |
| `INTERNAL_RATE_LIMIT_WINDOWS_CLEANUP_INTERVAL_MS` | `86400000` | optional | int `>=1000` | Cleanup cadence only | `INTERNAL_RATE_LIMIT_WINDOWS_CLEANUP_INTERVAL_MS=86400000` |
| `INTERNAL_RATE_LIMIT_WINDOWS_CLEANUP_INITIAL_DELAY_MS` | `60000` | optional | int `>=1000` | Cleanup cadence only | `INTERNAL_RATE_LIMIT_WINDOWS_CLEANUP_INITIAL_DELAY_MS=60000` |
| `INTERNAL_RATE_LIMIT_WINDOWS_CLEANUP_BATCH_SIZE` | `5000` | optional | int `>=1` | DB delete batch size | `INTERNAL_RATE_LIMIT_WINDOWS_CLEANUP_BATCH_SIZE=5000` |
| `ADMIN_LOGIN_LOCKOUTS_RETENTION_DAYS` | `7` | optional | int `>=1` | Brute-force lockout records retention | `ADMIN_LOGIN_LOCKOUTS_RETENTION_DAYS=7` |
| `ADMIN_LOGIN_LOCKOUTS_CLEANUP_INTERVAL_MS` | `86400000` | optional | int `>=1000` | Cleanup cadence only | `ADMIN_LOGIN_LOCKOUTS_CLEANUP_INTERVAL_MS=86400000` |
| `ADMIN_LOGIN_LOCKOUTS_CLEANUP_INITIAL_DELAY_MS` | `60000` | optional | int `>=1000` | Cleanup cadence only | `ADMIN_LOGIN_LOCKOUTS_CLEANUP_INITIAL_DELAY_MS=60000` |
| `ADMIN_LOGIN_LOCKOUTS_CLEANUP_BATCH_SIZE` | `5000` | optional | int `>=1` | DB delete batch size | `ADMIN_LOGIN_LOCKOUTS_CLEANUP_BATCH_SIZE=5000` |
| `REQUEST_LOG_ORPHAN_CLEANUP_INTERVAL_MS` | `86400000` | optional | int `>=1000` | Orphan sweep cadence | `REQUEST_LOG_ORPHAN_CLEANUP_INTERVAL_MS=86400000` |
| `REQUEST_LOG_ORPHAN_CLEANUP_INITIAL_DELAY_MS` | `300000` | optional | int `>=1000` | Orphan sweep startup delay | `REQUEST_LOG_ORPHAN_CLEANUP_INITIAL_DELAY_MS=300000` |
| `REQUEST_LOG_ORPHAN_CLEANUP_BATCH_SIZE` | `5000` | optional | int `>=1` | Orphan delete batch size | `REQUEST_LOG_ORPHAN_CLEANUP_BATCH_SIZE=5000` |
| `USAGE_MONTHLY_ORPHAN_CLEANUP_INTERVAL_MS` | `86400000` | optional | int `>=1000` | Orphan sweep cadence | `USAGE_MONTHLY_ORPHAN_CLEANUP_INTERVAL_MS=86400000` |
| `USAGE_MONTHLY_ORPHAN_CLEANUP_INITIAL_DELAY_MS` | `300000` | optional | int `>=1000` | Orphan sweep startup delay | `USAGE_MONTHLY_ORPHAN_CLEANUP_INITIAL_DELAY_MS=300000` |
| `USAGE_MONTHLY_ORPHAN_CLEANUP_BATCH_SIZE` | `5000` | optional | int `>=1` | Orphan delete batch size | `USAGE_MONTHLY_ORPHAN_CLEANUP_BATCH_SIZE=5000` |
| `SUBSCRIPTION_EVENTS_CLEANUP_INTERVAL_MS` | fallback from `_INTERVAL_DAYS` (default `86400000`) | optional | int `>=1000` | Cleanup cadence only | `SUBSCRIPTION_EVENTS_CLEANUP_INTERVAL_MS=86400000` |
| `SUBSCRIPTION_EVENTS_CLEANUP_INITIAL_DELAY_MS` | `300000` | optional | int `>=1000` | Cleanup startup delay | `SUBSCRIPTION_EVENTS_CLEANUP_INITIAL_DELAY_MS=300000` |
| `SUBSCRIPTION_EVENTS_CLEANUP_BATCH_SIZE` | `5000` | optional | int `>=1` | DB delete batch size | `SUBSCRIPTION_EVENTS_CLEANUP_BATCH_SIZE=5000` |
| `SUBSCRIPTION_EVENTS_RETENTION_DAYS` | `365` | optional | int `>=1` | Internal event retention | `SUBSCRIPTION_EVENTS_RETENTION_DAYS=365` |
| `ADMIN_SESSIONS_CLEANUP_BATCH_SIZE` | `5000` | optional | int `>=1` | Session cleanup batch size | `ADMIN_SESSIONS_CLEANUP_BATCH_SIZE=5000` |
| `ALERT_DELIVERIES_RETENTION_ENABLED` | `true` | optional | bool (`true/false/1/0`) | Retention job toggle | `ALERT_DELIVERIES_RETENTION_ENABLED=true` |
| `ALERT_DELIVERIES_RETENTION_DAYS` | `90` | optional | int `>=1` | Alert-delivery data retention | `ALERT_DELIVERIES_RETENTION_DAYS=90` |
| `ALERT_DELIVERIES_RETENTION_INTERVAL_MS` | `86400000` | optional | int `>=1000` | Cleanup cadence only | `ALERT_DELIVERIES_RETENTION_INTERVAL_MS=86400000` |
| `ALERT_DELIVERIES_RETENTION_INITIAL_DELAY_MS` | `60000` | optional | int `>=1000` | Cleanup startup delay | `ALERT_DELIVERIES_RETENTION_INITIAL_DELAY_MS=60000` |
| `ALERT_DELIVERIES_RETENTION_BATCH_SIZE` | `5000` | optional | int `>=1` | DB delete batch size | `ALERT_DELIVERIES_RETENTION_BATCH_SIZE=5000` |
| `ALERT_EVENTS_RETENTION_ENABLED` | `true` | optional | bool (`true/false/1/0`) | Retention job toggle | `ALERT_EVENTS_RETENTION_ENABLED=true` |
| `ALERT_EVENTS_RETENTION_DAYS` | `90` | optional | int `>=1` | Alert-event data retention | `ALERT_EVENTS_RETENTION_DAYS=90` |
| `ALERT_EVENTS_RETENTION_INTERVAL_MS` | `86400000` | optional | int `>=1000` | Cleanup cadence only | `ALERT_EVENTS_RETENTION_INTERVAL_MS=86400000` |
| `ALERT_EVENTS_RETENTION_INITIAL_DELAY_MS` | `60000` | optional | int `>=1000` | Cleanup startup delay | `ALERT_EVENTS_RETENTION_INITIAL_DELAY_MS=60000` |
| `ALERT_EVENTS_RETENTION_BATCH_SIZE` | `5000` | optional | int `>=1` | DB delete batch size | `ALERT_EVENTS_RETENTION_BATCH_SIZE=5000` |
| `H2I_OUTPUT_RETENTION_HOURS` | `24` | optional | int `>=1` | File retention only | `H2I_OUTPUT_RETENTION_HOURS=24` |
| `H2I_OUTPUT_CLEANUP_INTERVAL_MS` | `86400000` | optional | int `>=1000` | File cleanup cadence | `H2I_OUTPUT_CLEANUP_INTERVAL_MS=86400000` |
| `IMAGE_OUTPUT_RETENTION_HOURS` | `24` | optional | int `>=1` | File retention only | `IMAGE_OUTPUT_RETENTION_HOURS=24` |
| `IMAGE_OUTPUT_CLEANUP_INTERVAL_MS` | `86400000` | optional | int `>=1000` | File cleanup cadence | `IMAGE_OUTPUT_CLEANUP_INTERVAL_MS=86400000` |
| `PDF_OUTPUT_RETENTION_HOURS` | `24` | optional | int `>=1` | File retention only | `PDF_OUTPUT_RETENTION_HOURS=24` |
| `PDF_OUTPUT_CLEANUP_INTERVAL_MS` | `86400000` | optional | int `>=1000` | File cleanup cadence | `PDF_OUTPUT_CLEANUP_INTERVAL_MS=86400000` |
| `TOOLS_OUTPUT_RETENTION_HOURS` | `24` | optional | int `>=1` | File retention only | `TOOLS_OUTPUT_RETENTION_HOURS=24` |
| `TOOLS_OUTPUT_CLEANUP_INTERVAL_MS` | `86400000` | optional | int `>=1000` | File cleanup cadence | `TOOLS_OUTPUT_CLEANUP_INTERVAL_MS=86400000` |
| `TEMP_UPLOADS_RETENTION_HOURS` | fallback `PUBLIC_FILE_TTL_HOURS` (default `24`) | optional | int `>=1` | Temp upload retention | `TEMP_UPLOADS_RETENTION_HOURS=24` |
| `TEMP_UPLOADS_CLEANUP_INTERVAL_MS` | `86400000` | optional | int `>=1000` | Temp cleanup cadence | `TEMP_UPLOADS_CLEANUP_INTERVAL_MS=86400000` |
| `MONITORING_SNAPSHOTS_RETENTION_HOURS` | `72` | optional | int `>=1` | Snapshot retention | `MONITORING_SNAPSHOTS_RETENTION_HOURS=72` |
| `MONITORING_SNAPSHOTS_CLEANUP_INTERVAL_MS` | `21600000` | optional | int `>=1000` | Snapshot cleanup cadence | `MONITORING_SNAPSHOTS_CLEANUP_INTERVAL_MS=21600000` |
| `SMOKE_API_KEY` | none | tooling-only | string | test credential, treat as secret | `SMOKE_API_KEY=...` |
