# PixLab ENV reference (source of truth)

## Overview
- Canonical ENV reference for supported runtime and official script variables.
- Tier model: GLOBAL hard caps, OWNER controls, PUBLIC controls, CUSTOMER plan controls, INTERNAL controls, ADMIN controls, ALERTING controls, DIAGNOSTICS controls, TOOLING controls.
- Clamping model: `effective_limit = min(tier_limit, GLOBAL_cap)`.
- No aliases/fallback ENV keys are supported; use canonical names only.

## GLOBAL

### `GLOBAL_MAX_FILES_PER_REQ`
- **Tier:** GLOBAL
- **Type:** string
- **Default behavior:** none
- **What it controls:** Global hard cap used by limit resolution.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `GLOBAL_MAX_FILES_PER_REQ=<value>`
- **Where used:** `utils/config.js:76`, `utils/validateEnv.js:257`

### `GLOBAL_MAX_HTML_CHARS`
- **Tier:** GLOBAL
- **Type:** string
- **Default behavior:** none
- **What it controls:** Global hard cap used by limit resolution.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `GLOBAL_MAX_HTML_CHARS=<value>`
- **Where used:** `utils/limits.js:387`, `utils/validateEnv.js:242`

### `GLOBAL_MAX_RENDER_HEIGHT`
- **Tier:** GLOBAL
- **Type:** int
- **Default behavior:** none
- **What it controls:** Global hard cap used by limit resolution.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `GLOBAL_MAX_RENDER_HEIGHT=<value>`
- **Where used:** `utils/limits.js:389`, `utils/validateEnv.js:245`

### `GLOBAL_MAX_RENDER_PIXELS`
- **Tier:** GLOBAL
- **Type:** int
- **Default behavior:** none
- **What it controls:** Global hard cap used by limit resolution.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `GLOBAL_MAX_RENDER_PIXELS=<value>`
- **Where used:** `utils/limits.js:390`, `utils/validateEnv.js:243`

### `GLOBAL_MAX_RENDER_WIDTH`
- **Tier:** GLOBAL
- **Type:** int
- **Default behavior:** none
- **What it controls:** Global hard cap used by limit resolution.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `GLOBAL_MAX_RENDER_WIDTH=<value>`
- **Where used:** `utils/limits.js:388`, `utils/validateEnv.js:244`

### `GLOBAL_MAX_TOTAL_UPLOAD_MB`
- **Tier:** GLOBAL
- **Type:** string
- **Default behavior:** none
- **What it controls:** Global hard cap used by limit resolution.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `GLOBAL_MAX_TOTAL_UPLOAD_MB=<value>`
- **Where used:** `utils/config.js:75`, `utils/validateEnv.js:308`

### `GLOBAL_MAX_UPLOAD_BYTES`
- **Tier:** GLOBAL
- **Type:** string
- **Default behavior:** none
- **What it controls:** Global hard cap used by limit resolution.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `GLOBAL_MAX_UPLOAD_BYTES=<value>`
- **Where used:** `utils/limits.js:224`, `utils/validateEnv.js:241`

### `GLOBAL_PDF_MAX_PAGES_EXTRACT_IMAGES`
- **Tier:** GLOBAL
- **Type:** string
- **Default behavior:** none
- **What it controls:** Global hard cap used by limit resolution.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `GLOBAL_PDF_MAX_PAGES_EXTRACT_IMAGES=<value>`
- **Where used:** `utils/limits.js:435`

### `GLOBAL_PDF_MAX_PAGES_SPLIT`
- **Tier:** GLOBAL
- **Type:** string
- **Default behavior:** none
- **What it controls:** Global hard cap used by limit resolution.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `GLOBAL_PDF_MAX_PAGES_SPLIT=<value>`
- **Where used:** `utils/limits.js:436`

### `GLOBAL_PDF_MAX_PAGES_TO_IMAGES`
- **Tier:** GLOBAL
- **Type:** string
- **Default behavior:** none
- **What it controls:** Global hard cap used by limit resolution.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `GLOBAL_PDF_MAX_PAGES_TO_IMAGES=<value>`
- **Where used:** `utils/limits.js:434`

## OWNER

### `API_KEYS`
- **Tier:** OWNER
- **Type:** list
- **Default behavior:** '')
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Required in production (enforced by validateEnv).
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** secret/sensitive
- **Example:** `API_KEYS=<value>`
- **Where used:** `server.js:775`, `utils/validateEnv.js:91`

### `OWNER_IMAGE_MAX_DIMENSION_PX`
- **Tier:** OWNER
- **Type:** int
- **Default behavior:** none
- **What it controls:** Owner-tier limit override.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `OWNER_IMAGE_MAX_DIMENSION_PX=<value>`
- **Where used:** `utils/validateEnv.js:236`

### `OWNER_IMAGE_MAX_TOTAL_UPLOAD_MB`
- **Tier:** OWNER
- **Type:** string
- **Default behavior:** none
- **What it controls:** Owner-tier limit override.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `OWNER_IMAGE_MAX_TOTAL_UPLOAD_MB=<value>`
- **Where used:** `utils/validateEnv.js:235`

### `OWNER_MAX_FILES_PER_REQ`
- **Tier:** OWNER
- **Type:** string
- **Default behavior:** none
- **What it controls:** Owner-tier limit override.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `OWNER_MAX_FILES_PER_REQ=<value>`
- **Where used:** `utils/limits.js:213`, `utils/validateEnv.js:240`

### `OWNER_PDF_MAX_TOTAL_UPLOAD_MB`
- **Tier:** OWNER
- **Type:** string
- **Default behavior:** none
- **What it controls:** Owner-tier limit override.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `OWNER_PDF_MAX_TOTAL_UPLOAD_MB=<value>`
- **Where used:** `utils/validateEnv.js:237`

### `OWNER_TIMEOUT_MS`
- **Tier:** OWNER
- **Type:** int
- **Default behavior:** none
- **What it controls:** Owner-tier limit override.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `OWNER_TIMEOUT_MS=<value>`
- **Where used:** `utils/limits.js:142`, `utils/validateEnv.js:226`

### `OWNER_TOOLS_MAX_DIMENSION_PX`
- **Tier:** OWNER
- **Type:** int
- **Default behavior:** none
- **What it controls:** Owner-tier limit override.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `OWNER_TOOLS_MAX_DIMENSION_PX=<value>`
- **Where used:** `utils/validateEnv.js:239`

### `OWNER_TOOLS_MAX_TOTAL_UPLOAD_MB`
- **Tier:** OWNER
- **Type:** string
- **Default behavior:** none
- **What it controls:** Owner-tier limit override.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `OWNER_TOOLS_MAX_TOTAL_UPLOAD_MB=<value>`
- **Where used:** `utils/validateEnv.js:238`

## PUBLIC

### `PUBLIC_API_KEYS`
- **Tier:** PUBLIC
- **Type:** list
- **Default behavior:** '')
- **What it controls:** Public-tier endpoint behavior/limits.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** secret/sensitive
- **Example:** `PUBLIC_API_KEYS=<value>`
- **Where used:** `server.js:777`

### `PUBLIC_BASE_URL`
- **Tier:** PUBLIC
- **Type:** url
- **Default behavior:** `http://localhost:${PORT}`
- **What it controls:** Public-tier endpoint behavior/limits.
- **Production guidance:** Required in production (enforced by validateEnv).
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `PUBLIC_BASE_URL=<value>`
- **Where used:** `scripts/customer-key-smoke.js:2`, `scripts/prod-smoke.js:17`, `scripts/simulate-alert-notification.js:21`, `scripts/user-summary-smoke.js:2`, `server.js:165`, `server.js:414`, `utils/monitoringSnapshot.js:37`, `utils/validateEnv.js:95`

### `PUBLIC_H2I_DAILY_LIMIT`
- **Tier:** PUBLIC
- **Type:** int
- **Default behavior:** none
- **What it controls:** Public-tier endpoint behavior/limits.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `PUBLIC_H2I_DAILY_LIMIT=<value>`
- **Where used:** `routes/h2i-route.js:62`, `utils/validateEnv.js:218`

### `PUBLIC_H2I_MAX_HTML_CHARS`
- **Tier:** PUBLIC
- **Type:** string
- **Default behavior:** none
- **What it controls:** Public-tier endpoint behavior/limits.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `PUBLIC_H2I_MAX_HTML_CHARS=<value>`
- **Where used:** `utils/limits.js:395`, `utils/validateEnv.js:246`

### `PUBLIC_H2I_MAX_RENDER_HEIGHT`
- **Tier:** PUBLIC
- **Type:** int
- **Default behavior:** none
- **What it controls:** Public-tier endpoint behavior/limits.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `PUBLIC_H2I_MAX_RENDER_HEIGHT=<value>`
- **Where used:** `utils/limits.js:397`, `utils/validateEnv.js:248`

### `PUBLIC_H2I_MAX_RENDER_PIXELS`
- **Tier:** PUBLIC
- **Type:** int
- **Default behavior:** none
- **What it controls:** Public-tier endpoint behavior/limits.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `PUBLIC_H2I_MAX_RENDER_PIXELS=<value>`
- **Where used:** `utils/limits.js:398`, `utils/validateEnv.js:249`

### `PUBLIC_H2I_MAX_RENDER_WIDTH`
- **Tier:** PUBLIC
- **Type:** int
- **Default behavior:** none
- **What it controls:** Public-tier endpoint behavior/limits.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `PUBLIC_H2I_MAX_RENDER_WIDTH=<value>`
- **Where used:** `utils/limits.js:396`, `utils/validateEnv.js:247`

### `PUBLIC_H2I_TIMEOUT_MS`
- **Tier:** PUBLIC
- **Type:** int
- **Default behavior:** none
- **What it controls:** Public-tier endpoint behavior/limits.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `PUBLIC_H2I_TIMEOUT_MS=<value>`
- **Where used:** `utils/validateEnv.js:222`

### `PUBLIC_IMAGE_DAILY_LIMIT`
- **Tier:** PUBLIC
- **Type:** int
- **Default behavior:** none
- **What it controls:** Public-tier endpoint behavior/limits.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `PUBLIC_IMAGE_DAILY_LIMIT=<value>`
- **Where used:** `routes/image-route.js:54`, `utils/validateEnv.js:219`

### `PUBLIC_IMAGE_MAX_DIMENSION_PX`
- **Tier:** PUBLIC
- **Type:** int
- **Default behavior:** none
- **What it controls:** Public-tier endpoint behavior/limits.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `PUBLIC_IMAGE_MAX_DIMENSION_PX=<value>`
- **Where used:** `utils/limits.js:179`, `utils/validateEnv.js:229`

### `PUBLIC_IMAGE_MAX_FILES_PER_REQ`
- **Tier:** PUBLIC
- **Type:** string
- **Default behavior:** none
- **What it controls:** Public-tier endpoint behavior/limits.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `PUBLIC_IMAGE_MAX_FILES_PER_REQ=<value>`
- **Where used:** `utils/limits.js:177`, `utils/validateEnv.js:227`

### `PUBLIC_IMAGE_MAX_TOTAL_UPLOAD_MB`
- **Tier:** PUBLIC
- **Type:** string
- **Default behavior:** none
- **What it controls:** Public-tier endpoint behavior/limits.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `PUBLIC_IMAGE_MAX_TOTAL_UPLOAD_MB=<value>`
- **Where used:** `utils/limits.js:178`, `utils/validateEnv.js:228`

### `PUBLIC_IMAGE_TIMEOUT_MS`
- **Tier:** PUBLIC
- **Type:** int
- **Default behavior:** none
- **What it controls:** Public-tier endpoint behavior/limits.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `PUBLIC_IMAGE_TIMEOUT_MS=<value>`
- **Where used:** `utils/validateEnv.js:223`

### `PUBLIC_PDF_DAILY_LIMIT`
- **Tier:** PUBLIC
- **Type:** int
- **Default behavior:** none
- **What it controls:** Public-tier endpoint behavior/limits.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `PUBLIC_PDF_DAILY_LIMIT=<value>`
- **Where used:** `routes/pdf-route.js:60`, `utils/validateEnv.js:220`

### `PUBLIC_PDF_MAX_FILES_PER_REQ`
- **Tier:** PUBLIC
- **Type:** string
- **Default behavior:** none
- **What it controls:** Public-tier endpoint behavior/limits.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `PUBLIC_PDF_MAX_FILES_PER_REQ=<value>`
- **Where used:** `utils/limits.js:182`, `utils/validateEnv.js:230`

### `PUBLIC_PDF_MAX_PAGES_EXTRACT_IMAGES`
- **Tier:** PUBLIC
- **Type:** string
- **Default behavior:** none
- **What it controls:** Public-tier endpoint behavior/limits.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `PUBLIC_PDF_MAX_PAGES_EXTRACT_IMAGES=<value>`
- **Where used:** `utils/limits.js:442`, `utils/validateEnv.js:251`

### `PUBLIC_PDF_MAX_PAGES_SPLIT`
- **Tier:** PUBLIC
- **Type:** string
- **Default behavior:** none
- **What it controls:** Public-tier endpoint behavior/limits.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `PUBLIC_PDF_MAX_PAGES_SPLIT=<value>`
- **Where used:** `utils/limits.js:443`, `utils/validateEnv.js:252`

### `PUBLIC_PDF_MAX_PAGES_TO_IMAGES`
- **Tier:** PUBLIC
- **Type:** string
- **Default behavior:** none
- **What it controls:** Public-tier endpoint behavior/limits.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `PUBLIC_PDF_MAX_PAGES_TO_IMAGES=<value>`
- **Where used:** `utils/limits.js:441`, `utils/validateEnv.js:250`

### `PUBLIC_PDF_MAX_TOTAL_UPLOAD_MB`
- **Tier:** PUBLIC
- **Type:** string
- **Default behavior:** none
- **What it controls:** Public-tier endpoint behavior/limits.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `PUBLIC_PDF_MAX_TOTAL_UPLOAD_MB=<value>`
- **Where used:** `utils/limits.js:183`, `utils/validateEnv.js:231`

### `PUBLIC_PDF_TIMEOUT_MS`
- **Tier:** PUBLIC
- **Type:** int
- **Default behavior:** none
- **What it controls:** Public-tier endpoint behavior/limits.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `PUBLIC_PDF_TIMEOUT_MS=<value>`
- **Where used:** `utils/validateEnv.js:224`

### `PUBLIC_TOOLS_DAILY_LIMIT`
- **Tier:** PUBLIC
- **Type:** int
- **Default behavior:** none
- **What it controls:** Public-tier endpoint behavior/limits.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `PUBLIC_TOOLS_DAILY_LIMIT=<value>`
- **Where used:** `routes/tools-route.js:70`, `utils/validateEnv.js:221`

### `PUBLIC_TOOLS_MAX_DIMENSION_PX`
- **Tier:** PUBLIC
- **Type:** int
- **Default behavior:** none
- **What it controls:** Public-tier endpoint behavior/limits.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `PUBLIC_TOOLS_MAX_DIMENSION_PX=<value>`
- **Where used:** `utils/limits.js:189`, `utils/validateEnv.js:234`

### `PUBLIC_TOOLS_MAX_FILES_PER_REQ`
- **Tier:** PUBLIC
- **Type:** string
- **Default behavior:** none
- **What it controls:** Public-tier endpoint behavior/limits.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `PUBLIC_TOOLS_MAX_FILES_PER_REQ=<value>`
- **Where used:** `utils/limits.js:187`, `utils/validateEnv.js:232`

### `PUBLIC_TOOLS_MAX_TOTAL_UPLOAD_MB`
- **Tier:** PUBLIC
- **Type:** string
- **Default behavior:** none
- **What it controls:** Public-tier endpoint behavior/limits.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `PUBLIC_TOOLS_MAX_TOTAL_UPLOAD_MB=<value>`
- **Where used:** `utils/limits.js:188`, `utils/validateEnv.js:233`

### `PUBLIC_TOOLS_TIMEOUT_MS`
- **Tier:** PUBLIC
- **Type:** int
- **Default behavior:** none
- **What it controls:** Public-tier endpoint behavior/limits.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `PUBLIC_TOOLS_TIMEOUT_MS=<value>`
- **Where used:** `utils/validateEnv.js:225`

## CUSTOMER(PLAN)

No supported variables in this tier.

## INTERNAL

### `API_KEYS_EXPIRY_WATCHER_BATCH_SIZE`
- **Tier:** INTERNAL
- **Type:** int
- **Default behavior:** 500
- **What it controls:** Expiry watcher update batch size per normalization loop (no row deletion).
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** secret/sensitive
- **Example:** `API_KEYS_EXPIRY_WATCHER_BATCH_SIZE=<value>`
- **Where used:** `server.js:94`, `utils/validateEnv.js:187`

### `API_KEYS_EXPIRY_WATCHER_ENABLED`
- **Tier:** INTERNAL
- **Type:** bool
- **Default behavior:** true
- **What it controls:** Enables/disables the expiry watcher scheduler that normalizes expired active keys to disabled/expired (no row deletion).
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** secret/sensitive
- **Example:** `API_KEYS_EXPIRY_WATCHER_ENABLED=<value>`
- **Where used:** `server.js:92`, `utils/validateEnv.js:158`

### `API_KEYS_EXPIRY_WATCHER_INTERVAL_MS`
- **Tier:** INTERNAL
- **Type:** int
- **Default behavior:** 10 * 60 * 1000
- **What it controls:** Expiry watcher run interval for normalization passes (no row deletion).
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** secret/sensitive
- **Example:** `API_KEYS_EXPIRY_WATCHER_INTERVAL_MS=<value>`
- **Where used:** `server.js:93`, `utils/validateEnv.js:186`

### `API_KEYS_RETENTION_CLEANUP_ENABLED`
- **Tier:** INTERNAL
- **Type:** bool
- **Default behavior:** false
- **What it controls:** Separate API key retention cleanup scheduler for deleting old expired+disabled keys (distinct from expiry watcher state normalization).
- **Production guidance:** Set explicitly in production; enable only when retention deletion policy is approved.
- **Dev guidance:** Keep disabled unless testing retention cleanup behavior.
- **Security notes:** non-sensitive
- **Example:** `API_KEYS_RETENTION_CLEANUP_ENABLED=<value>`
- **Where used:** `server.js:120`, `utils/config.js:201`, `utils/validateEnv.js:160`

### `API_KEYS_RETENTION_CLEANUP_INTERVAL_MS`
- **Tier:** INTERNAL
- **Type:** int
- **Default behavior:** 24 * 60 * 60 * 1000
- **What it controls:** Interval for expired-key retention cleanup runs.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults are acceptable.
- **Security notes:** non-sensitive
- **Example:** `API_KEYS_RETENTION_CLEANUP_INTERVAL_MS=<value>`
- **Where used:** `server.js:122`, `utils/config.js:209`, `utils/validateEnv.js:191`

### `API_KEYS_RETENTION_CLEANUP_INITIAL_DELAY_MS`
- **Tier:** INTERNAL
- **Type:** int
- **Default behavior:** 60 * 1000
- **What it controls:** Initial delay before first expired-key retention cleanup run.
- **Production guidance:** Set explicitly for production.
- **Dev guidance:** Local defaults are acceptable.
- **Security notes:** non-sensitive
- **Example:** `API_KEYS_RETENTION_CLEANUP_INITIAL_DELAY_MS=<value>`
- **Where used:** `server.js:123`, `utils/config.js:213`, `utils/validateEnv.js:192`

### `API_KEYS_RETENTION_CLEANUP_BATCH_SIZE`
- **Tier:** INTERNAL
- **Type:** int
- **Default behavior:** 5000
- **What it controls:** Batch size for expired-key retention cleanup deletes.
- **Production guidance:** Set explicitly for production.
- **Dev guidance:** Local defaults are acceptable.
- **Security notes:** non-sensitive
- **Example:** `API_KEYS_RETENTION_CLEANUP_BATCH_SIZE=<value>`
- **Where used:** `server.js:124`, `utils/config.js:217`, `utils/validateEnv.js:193`

### `API_KEYS_RETENTION_DAYS`
- **Tier:** INTERNAL
- **Type:** int
- **Default behavior:** 180
- **What it controls:** Deletes only keys with `status='disabled'`, `subscription_status='expired'`, and `valid_until` older than this many days.
- **Production guidance:** Set explicitly according to billing/audit retention policy.
- **Dev guidance:** Local defaults are acceptable.
- **Security notes:** non-sensitive
- **Example:** `API_KEYS_RETENTION_DAYS=<value>`
- **Where used:** `server.js:121`, `utils/config.js:205`, `utils/validateEnv.js:190`

### `AUTO_RUN_MIGRATIONS`
- **Tier:** INTERNAL
- **Type:** bool
- **Default behavior:** `true`.
- **What it controls:** Enables/disables startup migration execution (`runMigrations()`) before the server starts listening.
- **Production guidance:** Keep enabled unless your deployment process runs migrations out-of-band in a controlled step.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `AUTO_RUN_MIGRATIONS=<value>`
- **Where used:** `utils/config.js:98`

### `BODY_PARSER_JSON_LIMIT`
- **Tier:** INTERNAL
- **Type:** int
- **Default behavior:** '20mb'
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `BODY_PARSER_JSON_LIMIT=<value>`
- **Where used:** `utils/limits.js:113`

### `BURST_LIMITS_WINDOW_CLEANUP_BATCH_SIZE`
- **Tier:** INTERNAL
- **Type:** int
- **Default behavior:** none
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `BURST_LIMITS_WINDOW_CLEANUP_BATCH_SIZE=<value>`
- **Where used:** `utils/retentionCleanup.js:52`, `utils/validateEnv.js:270`

### `BURST_LIMITS_WINDOW_CLEANUP_INITIAL_DELAY_MS`
- **Tier:** INTERNAL
- **Type:** int
- **Default behavior:** none
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `BURST_LIMITS_WINDOW_CLEANUP_INITIAL_DELAY_MS=<value>`
- **Where used:** `utils/retentionCleanup.js:51`, `utils/validateEnv.js:269`

### `BURST_LIMITS_WINDOW_CLEANUP_INTERVAL_MS`
- **Tier:** INTERNAL
- **Type:** int
- **Default behavior:** none
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `BURST_LIMITS_WINDOW_CLEANUP_INTERVAL_MS=<value>`
- **Where used:** `utils/retentionCleanup.js:50`, `utils/validateEnv.js:268`

### `BURST_LIMITS_WINDOW_RETENTION_DAYS`
- **Tier:** INTERNAL
- **Type:** int
- **Default behavior:** none
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `BURST_LIMITS_WINDOW_RETENTION_DAYS=<value>`
- **Where used:** `utils/config.js:166`, `utils/validateEnv.js:256`

### `BURST_LIMITS_WINDOW_RETENTION_ENABLED`
- **Tier:** INTERNAL
- **Type:** bool
- **Default behavior:** none
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `BURST_LIMITS_WINDOW_RETENTION_ENABLED=<value>`
- **Where used:** `utils/config.js:161`, `utils/validateEnv.js:164`

### `CORS_ORIGINS`
- **Tier:** INTERNAL
- **Type:** list
- **Default behavior:** 'https://h2i.davix.dev,https://davix.dev,https://www.davix.dev'
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `CORS_ORIGINS=<value>`
- **Where used:** `server.js:461`

### `DB_HOST`
- **Tier:** INTERNAL
- **Type:** string
- **Default behavior:** 'localhost',
- **What it controls:** Database connection or cleanup behavior.
- **Production guidance:** Required in production (enforced by validateEnv).
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `DB_HOST=<value>`
- **Where used:** `db.js:8`, `db.js:241`, `scripts/verify-schema.js:36`, `server.js:511`, `utils/validateEnv.js:92`

### `DB_NAME`
- **Tier:** INTERNAL
- **Type:** string
- **Default behavior:** 'pixlab',
- **What it controls:** Database connection or cleanup behavior.
- **Production guidance:** Required in production (enforced by validateEnv).
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `DB_NAME=<value>`
- **Where used:** `db.js:11`, `db.js:244`, `scripts/verify-schema.js:36`, `server.js:514`, `utils/validateEnv.js:94`

### `DB_ORPHAN_CLEANUP_ENABLED`
- **Tier:** INTERNAL
- **Type:** bool
- **Default behavior:** true
- **What it controls:** Database connection or cleanup behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `DB_ORPHAN_CLEANUP_ENABLED=<value>`
- **Where used:** `server.js:95`, `utils/orphanCleanup.js:10`, `utils/validateEnv.js:161`

### `DB_PASS`
- **Tier:** INTERNAL
- **Type:** string
- **Default behavior:** '',
- **What it controls:** Database connection or cleanup behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** secret/sensitive
- **Example:** `DB_PASS=<value>`
- **Where used:** `db.js:10`, `db.js:243`, `server.js:513`

### `DB_RETENTION_CLEANUP_ENABLED`
- **Tier:** INTERNAL
- **Type:** bool
- **Default behavior:** true
- **What it controls:** Database connection or cleanup behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `DB_RETENTION_CLEANUP_ENABLED=<value>`
- **Where used:** `server.js:96`, `utils/retentionCleanup.js:18`, `utils/validateEnv.js:167`

### `DB_USER`
- **Tier:** INTERNAL
- **Type:** string
- **Default behavior:** 'root',
- **What it controls:** Database connection or cleanup behavior.
- **Production guidance:** Required in production (enforced by validateEnv).
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `DB_USER=<value>`
- **Where used:** `db.js:9`, `db.js:242`, `scripts/verify-schema.js:36`, `server.js:512`, `utils/validateEnv.js:93`

### `H2I_ALLOW_FILE_SCHEME`
- **Tier:** INTERNAL
- **Type:** string
- **Default behavior:** none
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `H2I_ALLOW_FILE_SCHEME=<value>`
- **Where used:** `utils/config.js:64`, `utils/validateEnv.js:159`

### `H2I_BLOCK_PRIVATE_NETWORK`
- **Tier:** INTERNAL
- **Type:** string
- **Default behavior:** none
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `H2I_BLOCK_PRIVATE_NETWORK=<value>`
- **Where used:** `utils/config.js:63`, `utils/config.js:141`, `utils/validateEnv.js:160`

### `H2I_CONCURRENCY`
- **Tier:** INTERNAL
- **Type:** int
- **Default behavior:** none
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `H2I_CONCURRENCY=<value>`
- **Where used:** `utils/config.js:109`

### `H2I_CONCURRENCY_WAIT_MS`
- **Tier:** INTERNAL
- **Type:** int
- **Default behavior:** none
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `H2I_CONCURRENCY_WAIT_MS=<value>`
- **Where used:** `utils/config.js:110`

### `H2I_DNS_REBINDING_MODE`
- **Tier:** INTERNAL
- **Type:** enum
- **Default behavior:** '').toString().trim().toLowerCase()
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `H2I_DNS_REBINDING_MODE=<value>`
- **Where used:** `utils/config.js:139`, `utils/validateEnv.js:325`

### `H2I_OUTPUT_CLEANUP_INTERVAL_MS`
- **Tier:** INTERNAL
- **Type:** int
- **Default behavior:** none
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `H2I_OUTPUT_CLEANUP_INTERVAL_MS=<value>`
- **Where used:** `server.js:910`, `utils/validateEnv.js:206`

### `H2I_OUTPUT_RETENTION_HOURS`
- **Tier:** INTERNAL
- **Type:** int
- **Default behavior:** none
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `H2I_OUTPUT_RETENTION_HOURS=<value>`
- **Where used:** `server.js:910`, `utils/validateEnv.js:205`

### `IMAGE_CONCURRENCY`
- **Tier:** INTERNAL
- **Type:** int
- **Default behavior:** none
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `IMAGE_CONCURRENCY=<value>`
- **Where used:** `utils/config.js:117`

### `IMAGE_CONCURRENCY_WAIT_MS`
- **Tier:** INTERNAL
- **Type:** int
- **Default behavior:** none
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `IMAGE_CONCURRENCY_WAIT_MS=<value>`
- **Where used:** `utils/config.js:118`

### `IMAGE_OUTPUT_CLEANUP_INTERVAL_MS`
- **Tier:** INTERNAL
- **Type:** int
- **Default behavior:** none
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `IMAGE_OUTPUT_CLEANUP_INTERVAL_MS=<value>`
- **Where used:** `server.js:911`, `utils/validateEnv.js:208`

### `IMAGE_OUTPUT_RETENTION_HOURS`
- **Tier:** INTERNAL
- **Type:** int
- **Default behavior:** none
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `IMAGE_OUTPUT_RETENTION_HOURS=<value>`
- **Where used:** `server.js:911`, `utils/validateEnv.js:207`

### `INTERNAL_ALLOWED_IPS`
- **Tier:** INTERNAL
- **Type:** list
- **Default behavior:** '').trim()
- **What it controls:** Internal endpoint auth/rate-limit behavior.
- **Production guidance:** Required in production (enforced by validateEnv).
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `INTERNAL_ALLOWED_IPS=<value>`
- **Where used:** `scripts/verify-production.js:51`, `utils/internalAuth.js:17`, `utils/internalAuth.js:97`, `utils/validateEnv.js:98`

### `INTERNAL_BASE_URL`
- **Tier:** INTERNAL
- **Type:** url
- **Default behavior:** none
- **What it controls:** Internal endpoint auth/rate-limit behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `INTERNAL_BASE_URL=<value>`
- **Where used:** `utils/monitoringSnapshot.js:41`

### `INTERNAL_RATE_LIMIT_PER_MIN`
- **Tier:** INTERNAL
- **Type:** string
- **Default behavior:** 60
- **What it controls:** Internal endpoint auth/rate-limit behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `INTERNAL_RATE_LIMIT_PER_MIN=<value>`
- **Where used:** `utils/internalAuth.js:226`

### `INTERNAL_RATE_LIMIT_WINDOWS_CLEANUP_BATCH_SIZE`
- **Tier:** INTERNAL
- **Type:** int
- **Default behavior:** none
- **What it controls:** Internal endpoint auth/rate-limit behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `INTERNAL_RATE_LIMIT_WINDOWS_CLEANUP_BATCH_SIZE=<value>`
- **Where used:** `utils/retentionCleanup.js:59`, `utils/validateEnv.js:274`

### `INTERNAL_RATE_LIMIT_WINDOWS_CLEANUP_INITIAL_DELAY_MS`
- **Tier:** INTERNAL
- **Type:** int
- **Default behavior:** none
- **What it controls:** Internal endpoint auth/rate-limit behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `INTERNAL_RATE_LIMIT_WINDOWS_CLEANUP_INITIAL_DELAY_MS=<value>`
- **Where used:** `utils/retentionCleanup.js:58`, `utils/validateEnv.js:273`

### `INTERNAL_RATE_LIMIT_WINDOWS_CLEANUP_INTERVAL_MS`
- **Tier:** INTERNAL
- **Type:** int
- **Default behavior:** none
- **What it controls:** Internal endpoint auth/rate-limit behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `INTERNAL_RATE_LIMIT_WINDOWS_CLEANUP_INTERVAL_MS=<value>`
- **Where used:** `utils/retentionCleanup.js:57`, `utils/validateEnv.js:272`

### `INTERNAL_RATE_LIMIT_WINDOWS_RETENTION_DAYS`
- **Tier:** INTERNAL
- **Type:** int
- **Default behavior:** none
- **What it controls:** Internal endpoint auth/rate-limit behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `INTERNAL_RATE_LIMIT_WINDOWS_RETENTION_DAYS=<value>`
- **Where used:** `utils/retentionCleanup.js:56`, `utils/validateEnv.js:271`

### `INTERNAL_RATE_LIMIT_WINDOW_SECONDS`
- **Tier:** INTERNAL
- **Type:** int
- **Default behavior:** 60
- **What it controls:** Internal endpoint auth/rate-limit behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `INTERNAL_RATE_LIMIT_WINDOW_SECONDS=<value>`
- **Where used:** `utils/internalAuth.js:227`

### `NODE_ENV`
- **Tier:** INTERNAL
- **Type:** enum
- **Default behavior:** none
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `NODE_ENV=<value>`
- **Where used:** `scripts/verify-production.js:49`, `utils/config.js:4`, `utils/limits.js:429`, `utils/limits.js:430`

### `OUTPUT_CACHE_CONTROL`
- **Tier:** INTERNAL
- **Type:** string
- **Default behavior:** 'private, no-store',
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `OUTPUT_CACHE_CONTROL=<value>`
- **Where used:** `utils/config.js:57`

### `PDF_CONCURRENCY`
- **Tier:** INTERNAL
- **Type:** int
- **Default behavior:** none
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `PDF_CONCURRENCY=<value>`
- **Where used:** `routes/pdf-route.js:61`

### `PDF_CONCURRENCY_WAIT_MS`
- **Tier:** INTERNAL
- **Type:** int
- **Default behavior:** 15000
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `PDF_CONCURRENCY_WAIT_MS=<value>`
- **Where used:** `routes/pdf-route.js:62`

### `PDF_OUTPUT_CLEANUP_INTERVAL_MS`
- **Tier:** INTERNAL
- **Type:** int
- **Default behavior:** none
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `PDF_OUTPUT_CLEANUP_INTERVAL_MS=<value>`
- **Where used:** `server.js:912`, `utils/validateEnv.js:210`

### `PDF_OUTPUT_RETENTION_HOURS`
- **Tier:** INTERNAL
- **Type:** int
- **Default behavior:** none
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `PDF_OUTPUT_RETENTION_HOURS=<value>`
- **Where used:** `server.js:912`, `utils/validateEnv.js:209`

### `PORT`
- **Tier:** INTERNAL
- **Type:** int
- **Default behavior:** 3005
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `PORT=<value>`
- **Where used:** `scripts/verify-production.js:128`, `server.js:91`, `utils/monitoringSnapshot.js:56`

### `PUPPETEER_EXECUTABLE_PATH`
- **Tier:** INTERNAL
- **Type:** path
- **Default behavior:** null,
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `PUPPETEER_EXECUTABLE_PATH=<value>`
- **Where used:** `utils/monitoringSnapshot.js:316`

### `PUPPETEER_NO_SANDBOX`
- **Tier:** INTERNAL
- **Type:** bool
- **Default behavior:** `false` in production, `true` outside production.
- **What it controls:** Whether Chromium/Puppeteer launches with `--no-sandbox`.
- **Production guidance:** **Must remain `false` in production**. Validation fails startup if it resolves to `true`.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `PUPPETEER_NO_SANDBOX=<value>`
- **Where used:** `scripts/verify-production.js:52`, `utils/config.js:70`, `utils/monitoringSnapshot.js:317`, `utils/validateEnv.js:162`

### `QUOTA_LEDGER_CLEANUP_BATCH_SIZE`
- **Tier:** INTERNAL
- **Type:** int
- **Default behavior:** none
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `QUOTA_LEDGER_CLEANUP_BATCH_SIZE=<value>`
- **Where used:** `utils/config.js:196`, `utils/validateEnv.js:193`

### `QUOTA_LEDGER_CLEANUP_INTERVAL_DAYS`
- **Tier:** INTERNAL
- **Type:** int
- **Default behavior:** none
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `QUOTA_LEDGER_CLEANUP_INTERVAL_DAYS=<value>`
- **Where used:** `utils/config.js:188`, `utils/validateEnv.js:191`

### `QUOTA_LEDGER_ENABLED`
- **Tier:** INTERNAL
- **Type:** bool
- **Default behavior:** `true`.
- **What it controls:** Enables quota reservation idempotency/TTL ledger and associated reclaim/cleanup jobs.
- **Production guidance:** Keep enabled to preserve quota reservation consistency and automatic stale-reservation recovery.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `QUOTA_LEDGER_ENABLED=<value>`
- **Where used:** `utils/config.js:172`, `utils/validateEnv.js:165`

### `QUOTA_LEDGER_RECLAIM_BATCH_SIZE`
- **Tier:** INTERNAL
- **Type:** int
- **Default behavior:** none
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `QUOTA_LEDGER_RECLAIM_BATCH_SIZE=<value>`
- **Where used:** `utils/config.js:184`, `utils/validateEnv.js:190`

### `QUOTA_LEDGER_RECLAIM_INTERVAL_MS`
- **Tier:** INTERNAL
- **Type:** int
- **Default behavior:** none
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `QUOTA_LEDGER_RECLAIM_INTERVAL_MS=<value>`
- **Where used:** `utils/config.js:180`, `utils/validateEnv.js:189`

### `QUOTA_LEDGER_RETENTION_DAYS`
- **Tier:** INTERNAL
- **Type:** int
- **Default behavior:** none
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `QUOTA_LEDGER_RETENTION_DAYS=<value>`
- **Where used:** `utils/config.js:192`, `utils/validateEnv.js:192`

### `QUOTA_LEDGER_TTL_SECONDS`
- **Tier:** INTERNAL
- **Type:** int
- **Default behavior:** none
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `QUOTA_LEDGER_TTL_SECONDS=<value>`
- **Where used:** `utils/config.js:176`, `utils/validateEnv.js:188`

### `RATE_LIMITS_DAILY_CLEANUP_BATCH_SIZE`
- **Tier:** INTERNAL
- **Type:** int
- **Default behavior:** none
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `RATE_LIMITS_DAILY_CLEANUP_BATCH_SIZE=<value>`
- **Where used:** `utils/retentionCleanup.js:44`, `utils/validateEnv.js:267`

### `RATE_LIMITS_DAILY_CLEANUP_INITIAL_DELAY_MS`
- **Tier:** INTERNAL
- **Type:** int
- **Default behavior:** none
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `RATE_LIMITS_DAILY_CLEANUP_INITIAL_DELAY_MS=<value>`
- **Where used:** `utils/retentionCleanup.js:43`, `utils/validateEnv.js:266`

### `RATE_LIMITS_DAILY_CLEANUP_INTERVAL_MS`
- **Tier:** INTERNAL
- **Type:** int
- **Default behavior:** none
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `RATE_LIMITS_DAILY_CLEANUP_INTERVAL_MS=<value>`
- **Where used:** `utils/retentionCleanup.js:42`, `utils/validateEnv.js:265`

### `RATE_LIMITS_DAILY_RETENTION_DAYS`
- **Tier:** INTERNAL
- **Type:** int
- **Default behavior:** none
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `RATE_LIMITS_DAILY_RETENTION_DAYS=<value>`
- **Where used:** `utils/config.js:156`, `utils/validateEnv.js:255`

### `RATE_LIMITS_DAILY_RETENTION_ENABLED`
- **Tier:** INTERNAL
- **Type:** bool
- **Default behavior:** none
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `RATE_LIMITS_DAILY_RETENTION_ENABLED=<value>`
- **Where used:** `utils/config.js:151`, `utils/validateEnv.js:163`

### `RATE_LIMIT_DB_FAILURE_MODE`
- **Tier:** INTERNAL
- **Type:** enum
- **Default behavior:** `'memory'` (allowed values: `memory`, `open`, `closed`).
- **What it controls:** Rate-limit behavior when DB-backed limiter store is unavailable.
- **Production nuance:** For public endpoint daily limit checks, configured `open` is treated as `closed` in production.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `RATE_LIMIT_DB_FAILURE_MODE=<value>`
- **Where used:** `utils/config.js:82`, `utils/validateEnv.js:324`

### `RATE_LIMIT_FAIL_CLOSED`
- **Tier:** INTERNAL
- **Type:** bool
- **Default behavior:** true in production (forced by code); false outside production unless explicitly set.
- **What it controls:** Fail-closed behavior for rate-limit infrastructure failures.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `RATE_LIMIT_FAIL_CLOSED=<value>`
- **Where used:** `utils/config.js:89`

### `REQUEST_LOG_CLEANUP_BATCH_SIZE`
- **Tier:** INTERNAL
- **Type:** int
- **Default behavior:** none
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `REQUEST_LOG_CLEANUP_BATCH_SIZE=<value>`
- **Where used:** `utils/retentionCleanup.js:28`, `utils/validateEnv.js:261`

### `REQUEST_LOG_CLEANUP_INITIAL_DELAY_MS`
- **Tier:** INTERNAL
- **Type:** int
- **Default behavior:** none
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `REQUEST_LOG_CLEANUP_INITIAL_DELAY_MS=<value>`
- **Where used:** `utils/retentionCleanup.js:27`, `utils/validateEnv.js:260`

### `REQUEST_LOG_CLEANUP_INTERVAL_MS`
- **Tier:** INTERNAL
- **Type:** int
- **Default behavior:** none
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `REQUEST_LOG_CLEANUP_INTERVAL_MS=<value>`
- **Where used:** `utils/retentionCleanup.js:26`, `utils/validateEnv.js:259`

### `REQUEST_LOG_ORPHAN_CLEANUP_BATCH_SIZE`
- **Tier:** INTERNAL
- **Type:** int
- **Default behavior:** none
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `REQUEST_LOG_ORPHAN_CLEANUP_BATCH_SIZE=<value>`
- **Where used:** `utils/validateEnv.js:281`

### `REQUEST_LOG_ORPHAN_CLEANUP_INITIAL_DELAY_MS`
- **Tier:** INTERNAL
- **Type:** int
- **Default behavior:** none
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `REQUEST_LOG_ORPHAN_CLEANUP_INITIAL_DELAY_MS=<value>`
- **Where used:** `utils/validateEnv.js:280`

### `REQUEST_LOG_ORPHAN_CLEANUP_INTERVAL_MS`
- **Tier:** INTERNAL
- **Type:** int
- **Default behavior:** none
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `REQUEST_LOG_ORPHAN_CLEANUP_INTERVAL_MS=<value>`
- **Where used:** `utils/validateEnv.js:279`

### `REQUEST_LOG_RETENTION_DAYS`
- **Tier:** INTERNAL
- **Type:** int
- **Default behavior:** none
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `REQUEST_LOG_RETENTION_DAYS=<value>`
- **Where used:** `utils/retentionCleanup.js:24`, `utils/validateEnv.js:194`

### `REQUEST_LOG_SCHEMA_ENSURE_ON_STARTUP`
- **Tier:** INTERNAL
- **Type:** boolean
- **Default behavior:** production: `false`; non-production: `true`.
- **What it controls:** Whether PixLab attempts request-log schema ensure/ALTER at startup.
- **Production guidance:** Prefer `false` and run migrations out-of-band. Enable only as an emergency self-heal during controlled maintenance.
- **Operational behavior when `false`:** startup performs a read-only compatibility check; if schema is missing/incompatible, startup fails fast with guidance to run migrations or set `REQUEST_LOG_SCHEMA_ENSURE_ON_STARTUP=true`.
- **Dev guidance:** Keep default `true` for local self-healing unless explicitly testing strict production behavior.
- **Security notes:** non-sensitive
- **Example:** `REQUEST_LOG_SCHEMA_ENSURE_ON_STARTUP=false`
- **Where used:** `utils/config.js:97`, `server.js:240`, `server.js:1189`

### `REQUIRE_SIGNED_OUTPUT_URLS`
- **Tier:** INTERNAL
- **Type:** bool
- **Default behavior:** true in production (forced by code); false outside production unless explicitly set.
- **What it controls:** Requires signed output URLs for protected output files.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `REQUIRE_SIGNED_OUTPUT_URLS=<value>`
- **Where used:** `scripts/verify-production.js:50`, `utils/config.js:48`, `utils/validateEnv.js:166`

### `SIGNED_URL_ALGO`
- **Tier:** INTERNAL
- **Type:** enum
- **Default behavior:** 'sha256',
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `SIGNED_URL_ALGO=<value>`
- **Where used:** `utils/config.js:56`

### `SIGNED_URL_SECRET`
- **Tier:** INTERNAL
- **Type:** string
- **Default behavior:** `''` (empty string).
- **Requiredness:** required whenever signed output URLs are enabled (always in production).
- **What it controls:** HMAC secret used to sign/verify output URLs.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** secret/sensitive
- **Example:** `SIGNED_URL_SECRET=<value>`
- **Where used:** `utils/config.js:54`

### `SIGNED_URL_TTL_SECONDS`
- **Tier:** INTERNAL
- **Type:** int
- **Default behavior:** `86400` seconds (24h) fallback from config getter.
- **Requiredness:** validated as required when signed output URLs are enabled (always in production).
- **What it controls:** Signed output URL expiration TTL in seconds.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `SIGNED_URL_TTL_SECONDS=<value>`
- **Where used:** `utils/config.js:55`, `utils/validateEnv.js:144`, `utils/validateEnv.js:253`

### `SUBSCRIPTION_BRIDGE_TOKEN`
- **Tier:** INTERNAL
- **Type:** string
- **Default behavior:** ''
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** secret/sensitive
- **Example:** `SUBSCRIPTION_BRIDGE_TOKEN=<value>`
- **Where used:** `routes/subscription-route.js:2396`, `scripts/customer-key-smoke.js:3`, `scripts/simulate-alert-notification.js:24`, `scripts/user-summary-smoke.js:3`, `scripts/verify-production.js:134`, `utils/alerts.js:687`, `utils/alerts.js:688`, `utils/internalAuth.js:123`, `utils/internalAuth.js:125`, `utils/internalAuth.js:130`, `utils/monitoringSnapshot.js:72`, `utils/monitoringSnapshot.js:73`, `utils/monitoringSnapshot.js:261`, `utils/validateEnv.js:77`

### `SUBSCRIPTION_EVENTS_CLEANUP_BATCH_SIZE`
- **Tier:** INTERNAL
- **Type:** int
- **Default behavior:** none
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `SUBSCRIPTION_EVENTS_CLEANUP_BATCH_SIZE=<value>`
- **Where used:** `utils/validateEnv.js:288`

### `SUBSCRIPTION_EVENTS_CLEANUP_INITIAL_DELAY_MS`
- **Tier:** INTERNAL
- **Type:** int
- **Default behavior:** none
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `SUBSCRIPTION_EVENTS_CLEANUP_INITIAL_DELAY_MS=<value>`
- **Where used:** `utils/validateEnv.js:287`

### `SUBSCRIPTION_EVENTS_CLEANUP_INTERVAL_MS`
- **Tier:** INTERNAL
- **Type:** int
- **Default behavior:** none
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `SUBSCRIPTION_EVENTS_CLEANUP_INTERVAL_MS=<value>`
- **Where used:** `utils/validateEnv.js:286`

### `SUBSCRIPTION_EVENTS_RETENTION_DAYS`
- **Tier:** INTERNAL
- **Type:** int
- **Default behavior:** none
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `SUBSCRIPTION_EVENTS_RETENTION_DAYS=<value>`
- **Where used:** `utils/validateEnv.js:285`

### `SUPPORT_EMAIL`
- **Tier:** INTERNAL
- **Type:** string
- **Default behavior:** '').trim()
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `SUPPORT_EMAIL=<value>`
- **Where used:** `utils/errorResponse.js:106`

### `SUPPORT_URL`
- **Tier:** INTERNAL
- **Type:** url
- **Default behavior:** '').trim()
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `SUPPORT_URL=<value>`
- **Where used:** `utils/errorResponse.js:107`

### `TEMP_UPLOADS_CLEANUP_INTERVAL_MS`
- **Tier:** INTERNAL
- **Type:** int
- **Default behavior:** none
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `TEMP_UPLOADS_CLEANUP_INTERVAL_MS=<value>`
- **Where used:** `server.js:970`, `utils/validateEnv.js:214`

### `TEMP_UPLOADS_RETENTION_HOURS`
- **Tier:** INTERNAL
- **Type:** int
- **Default behavior:** none
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `TEMP_UPLOADS_RETENTION_HOURS=<value>`
- **Where used:** `server.js:969`, `utils/validateEnv.js:213`

### `TOOLS_CONCURRENCY`
- **Tier:** INTERNAL
- **Type:** int
- **Default behavior:** none
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `TOOLS_CONCURRENCY=<value>`
- **Where used:** `utils/config.js:125`

### `TOOLS_CONCURRENCY_WAIT_MS`
- **Tier:** INTERNAL
- **Type:** int
- **Default behavior:** none
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `TOOLS_CONCURRENCY_WAIT_MS=<value>`
- **Where used:** `utils/config.js:126`

### `TOOLS_OUTPUT_CLEANUP_INTERVAL_MS`
- **Tier:** INTERNAL
- **Type:** int
- **Default behavior:** none
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `TOOLS_OUTPUT_CLEANUP_INTERVAL_MS=<value>`
- **Where used:** `server.js:913`, `utils/validateEnv.js:212`

### `TOOLS_OUTPUT_RETENTION_HOURS`
- **Tier:** INTERNAL
- **Type:** int
- **Default behavior:** none
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `TOOLS_OUTPUT_RETENTION_HOURS=<value>`
- **Where used:** `server.js:913`, `utils/validateEnv.js:211`

### `TRUST_PROXY`
- **Tier:** INTERNAL
- **Type:** enum
- **Default behavior:** none
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Required in production. Set explicitly for your proxy chain (for most Plesk/nginx single-hop setups use `TRUST_PROXY=1`).
- **Dev guidance:** Optional in development; defaults to disabled when not set.
- **Security notes:** non-sensitive
- **Example:** `TRUST_PROXY=1`
- **Where used:** `utils/config.js:35`, `utils/validateEnv.js:336`, `utils/validateEnv.js:337`

### `USAGE_MONTHLY_CLEANUP_BATCH_SIZE`
- **Tier:** INTERNAL
- **Type:** int
- **Default behavior:** none
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `USAGE_MONTHLY_CLEANUP_BATCH_SIZE=<value>`
- **Where used:** `utils/retentionCleanup.js:36`, `utils/validateEnv.js:264`

### `USAGE_MONTHLY_CLEANUP_INITIAL_DELAY_MS`
- **Tier:** INTERNAL
- **Type:** int
- **Default behavior:** none
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `USAGE_MONTHLY_CLEANUP_INITIAL_DELAY_MS=<value>`
- **Where used:** `utils/retentionCleanup.js:35`, `utils/validateEnv.js:263`

### `USAGE_MONTHLY_CLEANUP_INTERVAL_MS`
- **Tier:** INTERNAL
- **Type:** int
- **Default behavior:** none
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `USAGE_MONTHLY_CLEANUP_INTERVAL_MS=<value>`
- **Where used:** `utils/retentionCleanup.js:34`, `utils/validateEnv.js:262`

### `USAGE_MONTHLY_ORPHAN_CLEANUP_BATCH_SIZE`
- **Tier:** INTERNAL
- **Type:** int
- **Default behavior:** none
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `USAGE_MONTHLY_ORPHAN_CLEANUP_BATCH_SIZE=<value>`
- **Where used:** `utils/validateEnv.js:284`

### `USAGE_MONTHLY_ORPHAN_CLEANUP_INITIAL_DELAY_MS`
- **Tier:** INTERNAL
- **Type:** int
- **Default behavior:** none
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `USAGE_MONTHLY_ORPHAN_CLEANUP_INITIAL_DELAY_MS=<value>`
- **Where used:** `utils/validateEnv.js:283`

### `USAGE_MONTHLY_ORPHAN_CLEANUP_INTERVAL_MS`
- **Tier:** INTERNAL
- **Type:** int
- **Default behavior:** none
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `USAGE_MONTHLY_ORPHAN_CLEANUP_INTERVAL_MS=<value>`
- **Where used:** `utils/validateEnv.js:282`

### `USAGE_MONTHLY_RETENTION_MONTHS`
- **Tier:** INTERNAL
- **Type:** int
- **Default behavior:** none
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `USAGE_MONTHLY_RETENTION_MONTHS=<value>`
- **Where used:** `utils/retentionCleanup.js:32`, `utils/validateEnv.js:195`

### `VALID_FROM_GRACE_SECONDS`
- **Tier:** INTERNAL
- **Type:** int
- **Default behavior:** 120
- **What it controls:** Grace seconds applied to `valid_from` during provisioning and request-time key validation.
- **Production guidance:** Set explicitly for production to avoid drift-induced activation edge cases.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `VALID_FROM_GRACE_SECONDS=<value>`
- **Where used:** `utils/time.js:4`, `utils/validateEnv.js:254`

### `WEBSITE_URL`
- **Tier:** INTERNAL
- **Type:** url
- **Default behavior:** '').trim()
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `WEBSITE_URL=<value>`
- **Where used:** `utils/errorResponse.js:108`

## ADMIN

### `ADMIN_AUDIT_LOG_ENABLED`
- **Tier:** ADMIN
- **Type:** bool
- **Default behavior:** none
- **What it controls:** Admin authentication/session/retention behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `ADMIN_AUDIT_LOG_ENABLED=<value>`
- **Where used:** `utils/logger.js:131`, `utils/logger.js:232`, `utils/validateEnv.js:157`

### `ADMIN_LOGIN_LOCKOUTS_CLEANUP_BATCH_SIZE`
- **Tier:** ADMIN
- **Type:** int
- **Default behavior:** none
- **What it controls:** Admin authentication/session/retention behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `ADMIN_LOGIN_LOCKOUTS_CLEANUP_BATCH_SIZE=<value>`
- **Where used:** `utils/retentionCleanup.js:66`, `utils/validateEnv.js:278`

### `ADMIN_LOGIN_LOCKOUTS_CLEANUP_INITIAL_DELAY_MS`
- **Tier:** ADMIN
- **Type:** int
- **Default behavior:** none
- **What it controls:** Admin authentication/session/retention behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `ADMIN_LOGIN_LOCKOUTS_CLEANUP_INITIAL_DELAY_MS=<value>`
- **Where used:** `utils/retentionCleanup.js:65`, `utils/validateEnv.js:277`

### `ADMIN_LOGIN_LOCKOUTS_CLEANUP_INTERVAL_MS`
- **Tier:** ADMIN
- **Type:** int
- **Default behavior:** none
- **What it controls:** Admin authentication/session/retention behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `ADMIN_LOGIN_LOCKOUTS_CLEANUP_INTERVAL_MS=<value>`
- **Where used:** `utils/retentionCleanup.js:64`, `utils/validateEnv.js:276`

### `ADMIN_LOGIN_LOCKOUTS_RETENTION_DAYS`
- **Tier:** ADMIN
- **Type:** int
- **Default behavior:** none
- **What it controls:** Admin authentication/session/retention behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `ADMIN_LOGIN_LOCKOUTS_RETENTION_DAYS=<value>`
- **Where used:** `utils/retentionCleanup.js:63`, `utils/validateEnv.js:275`

### `ADMIN_LOGIN_LOCK_MINUTES`
- **Tier:** ADMIN
- **Type:** int
- **Default behavior:** 15
- **What it controls:** Admin authentication/session/retention behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `ADMIN_LOGIN_LOCK_MINUTES=<value>`
- **Where used:** `utils/adminAuth.js:29`, `utils/validateEnv.js:184`

### `ADMIN_LOGIN_MAX_ATTEMPTS`
- **Tier:** ADMIN
- **Type:** string
- **Default behavior:** 5
- **What it controls:** Admin authentication/session/retention behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `ADMIN_LOGIN_MAX_ATTEMPTS=<value>`
- **Where used:** `utils/adminAuth.js:28`, `utils/validateEnv.js:183`

### `ADMIN_LOGIN_WINDOW_MINUTES`
- **Tier:** ADMIN
- **Type:** int
- **Default behavior:** 15
- **What it controls:** Admin authentication/session/retention behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `ADMIN_LOGIN_WINDOW_MINUTES=<value>`
- **Where used:** `utils/adminAuth.js:27`, `utils/validateEnv.js:182`

### `ADMIN_PASS`
- **Tier:** ADMIN
- **Type:** string
- **Default behavior:** null
- **What it controls:** Admin authentication/session/retention behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** secret/sensitive
- **Example:** `ADMIN_PASS=<value>`
- **Where used:** `scripts/verify-production.js:53`, `server.js:117`, `utils/validateEnv.js:74`

### `ADMIN_PASSWORD_HASH`
- **Tier:** ADMIN
- **Type:** string
- **Default behavior:** ''
- **What it controls:** Admin authentication/session/retention behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** secret/sensitive
- **Example:** `ADMIN_PASSWORD_HASH=<value>`
- **Where used:** `utils/adminAuth.js:172`, `utils/validateEnv.js:86`

### `ADMIN_PATH`
- **Tier:** ADMIN
- **Type:** path
- **Default behavior:** 'acp'
- **What it controls:** Admin authentication/session/retention behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `ADMIN_PATH=<value>`
- **Where used:** `server.js:116`

### `ADMIN_SESSIONS_CLEANUP_BATCH_SIZE`
- **Tier:** ADMIN
- **Type:** int
- **Default behavior:** 5000
- **What it controls:** Admin authentication/session/retention behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `ADMIN_SESSIONS_CLEANUP_BATCH_SIZE=<value>`
- **Where used:** `server.js:1002`, `utils/validateEnv.js:291`

### `ADMIN_SESSIONS_CLEANUP_INTERVAL_MS`
- **Tier:** ADMIN
- **Type:** int
- **Default behavior:** 24 * 60 * 60 * 1000
- **What it controls:** Admin authentication/session/retention behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `ADMIN_SESSIONS_CLEANUP_INTERVAL_MS=<value>`
- **Where used:** `server.js:1000`, `utils/validateEnv.js:290`

### `ADMIN_SESSIONS_RETENTION_DAYS`
- **Tier:** ADMIN
- **Type:** int
- **Default behavior:** 10
- **What it controls:** Admin authentication/session/retention behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `ADMIN_SESSIONS_RETENTION_DAYS=<value>`
- **Where used:** `server.js:1001`, `utils/validateEnv.js:289`

### `ADMIN_SESSIONS_RETENTION_ENABLED`
- **Tier:** ADMIN
- **Type:** bool
- **Default behavior:** none
- **What it controls:** Admin authentication/session/retention behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `ADMIN_SESSIONS_RETENTION_ENABLED=<value>`
- **Where used:** `server.js:999`, `utils/validateEnv.js:170`

### `ADMIN_SESSION_SECRET`
- **Tier:** ADMIN
- **Type:** string
- **Default behavior:** required
- **What it controls:** Admin authentication/session/retention behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** secret/sensitive
- **Example:** `ADMIN_SESSION_SECRET=<value>`
- **Where used:** `server.js:502`, `utils/validateEnv.js:76`

### `ADMIN_TOTP_SECRET`
- **Tier:** ADMIN
- **Type:** string
- **Default behavior:** null
- **What it controls:** Admin authentication/session/retention behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** secret/sensitive
- **Example:** `ADMIN_TOTP_SECRET=<value>`
- **Where used:** `utils/adminAuth.js:181`, `utils/validateEnv.js:75`

## ALERTING

### `ALERT_DELIVERIES_RETENTION_BATCH_SIZE`
- **Tier:** ALERTING
- **Type:** int
- **Default behavior:** 5000
- **What it controls:** Alert delivery channel or retention behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `ALERT_DELIVERIES_RETENTION_BATCH_SIZE=<value>`
- **Where used:** `server.js:103`, `utils/alertRetentionCleanup.js:13`, `utils/validateEnv.js:199`

### `ALERT_DELIVERIES_RETENTION_DAYS`
- **Tier:** ALERTING
- **Type:** int
- **Default behavior:** 90
- **What it controls:** Alert delivery channel or retention behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `ALERT_DELIVERIES_RETENTION_DAYS=<value>`
- **Where used:** `server.js:98`, `utils/alertRetentionCleanup.js:8`, `utils/validateEnv.js:196`

### `ALERT_DELIVERIES_RETENTION_ENABLED`
- **Tier:** ALERTING
- **Type:** bool
- **Default behavior:** true
- **What it controls:** Alert delivery channel or retention behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `ALERT_DELIVERIES_RETENTION_ENABLED=<value>`
- **Where used:** `server.js:97`, `utils/alertRetentionCleanup.js:7`, `utils/validateEnv.js:168`

### `ALERT_DELIVERIES_RETENTION_INITIAL_DELAY_MS`
- **Tier:** ALERTING
- **Type:** int
- **Default behavior:** 60 * 1000
- **What it controls:** Alert delivery channel or retention behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `ALERT_DELIVERIES_RETENTION_INITIAL_DELAY_MS=<value>`
- **Where used:** `server.js:102`, `utils/alertRetentionCleanup.js:12`, `utils/validateEnv.js:198`

### `ALERT_DELIVERIES_RETENTION_INTERVAL_MS`
- **Tier:** ALERTING
- **Type:** int
- **Default behavior:** 24 * 60 * 60 * 1000
- **What it controls:** Alert delivery channel or retention behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `ALERT_DELIVERIES_RETENTION_INTERVAL_MS=<value>`
- **Where used:** `server.js:100`, `utils/alertRetentionCleanup.js:10`, `utils/validateEnv.js:197`

### `ALERT_EMAIL_FROM`
- **Tier:** ALERTING
- **Type:** string
- **Default behavior:** 'pixlab@localhost'
- **What it controls:** Alert delivery channel or retention behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `ALERT_EMAIL_FROM=<value>`
- **Where used:** `utils/alerts.js:254`

### `ALERT_EMAIL_HOST`
- **Tier:** ALERTING
- **Type:** string
- **Default behavior:** none
- **What it controls:** Alert delivery channel or retention behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `ALERT_EMAIL_HOST=<value>`
- **Where used:** `utils/alerts.js:231`

### `ALERT_EMAIL_JSON_TRANSPORT`
- **Tier:** ALERTING
- **Type:** bool
- **Default behavior:** '').toLowerCase() === 'true') {
- **What it controls:** Alert delivery channel or retention behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `ALERT_EMAIL_JSON_TRANSPORT=<value>`
- **Where used:** `scripts/test-alert-notification-pipeline.js:42`, `utils/alerts.js:232`

### `ALERT_EMAIL_PASS`
- **Tier:** ALERTING
- **Type:** string
- **Default behavior:** null
- **What it controls:** Alert delivery channel or retention behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** secret/sensitive
- **Example:** `ALERT_EMAIL_PASS=<value>`
- **Where used:** `utils/alerts.js:239`

### `ALERT_EMAIL_PORT`
- **Tier:** ALERTING
- **Type:** int
- **Default behavior:** 587
- **What it controls:** Alert delivery channel or retention behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `ALERT_EMAIL_PORT=<value>`
- **Where used:** `utils/alerts.js:236`, `utils/validateEnv.js:185`

### `ALERT_EMAIL_SECURE`
- **Tier:** ALERTING
- **Type:** bool
- **Default behavior:** '').toLowerCase() === 'true'
- **What it controls:** Alert delivery channel or retention behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `ALERT_EMAIL_SECURE=<value>`
- **Where used:** `utils/alerts.js:237`

### `ALERT_EMAIL_USER`
- **Tier:** ALERTING
- **Type:** string
- **Default behavior:** null
- **What it controls:** Alert delivery channel or retention behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `ALERT_EMAIL_USER=<value>`
- **Where used:** `utils/alerts.js:238`

### `ALERT_EVENTS_RETENTION_BATCH_SIZE`
- **Tier:** ALERTING
- **Type:** int
- **Default behavior:** 5000
- **What it controls:** Alert delivery channel or retention behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `ALERT_EVENTS_RETENTION_BATCH_SIZE=<value>`
- **Where used:** `server.js:108`, `utils/alertRetentionCleanup.js:20`, `utils/validateEnv.js:203`

### `ALERT_EVENTS_RETENTION_DAYS`
- **Tier:** ALERTING
- **Type:** int
- **Default behavior:** 90
- **What it controls:** Alert delivery channel or retention behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `ALERT_EVENTS_RETENTION_DAYS=<value>`
- **Where used:** `server.js:105`, `utils/alertRetentionCleanup.js:16`, `utils/validateEnv.js:200`

### `ALERT_EVENTS_RETENTION_ENABLED`
- **Tier:** ALERTING
- **Type:** bool
- **Default behavior:** true
- **What it controls:** Alert delivery channel or retention behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `ALERT_EVENTS_RETENTION_ENABLED=<value>`
- **Where used:** `server.js:104`, `utils/alertRetentionCleanup.js:15`, `utils/validateEnv.js:169`

### `ALERT_EVENTS_RETENTION_INITIAL_DELAY_MS`
- **Tier:** ALERTING
- **Type:** int
- **Default behavior:** 60 * 1000
- **What it controls:** Alert delivery channel or retention behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `ALERT_EVENTS_RETENTION_INITIAL_DELAY_MS=<value>`
- **Where used:** `server.js:107`, `utils/alertRetentionCleanup.js:19`, `utils/validateEnv.js:202`

### `ALERT_EVENTS_RETENTION_INTERVAL_MS`
- **Tier:** ALERTING
- **Type:** int
- **Default behavior:** 24 * 60 * 60 * 1000
- **What it controls:** Alert delivery channel or retention behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `ALERT_EVENTS_RETENTION_INTERVAL_MS=<value>`
- **Where used:** `server.js:106`, `utils/alertRetentionCleanup.js:17`, `utils/validateEnv.js:201`

### `ALERT_TELEGRAM_API_BASE_URL`
- **Tier:** ALERTING
- **Type:** url
- **Default behavior:** 'https://api.telegram.org'
- **What it controls:** Alert delivery channel or retention behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `ALERT_TELEGRAM_API_BASE_URL=<value>`
- **Where used:** `scripts/test-alert-notification-pipeline.js:41`, `utils/alerts.js:338`

### `ALERT_TELEGRAM_BOT_TOKEN`
- **Tier:** ALERTING
- **Type:** string
- **Default behavior:** none
- **What it controls:** Alert delivery channel or retention behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** secret/sensitive
- **Example:** `ALERT_TELEGRAM_BOT_TOKEN=<value>`
- **Where used:** `scripts/test-alert-notification-pipeline.js:40`, `utils/alerts.js:357`, `utils/alerts.js:467`

## DIAGNOSTICS

### `DAVIX_DEBUG_INTERNAL`
- **Tier:** DIAGNOSTICS
- **Type:** bool
- **Default behavior:** false (unless set to '1')
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `DAVIX_DEBUG_INTERNAL=<value>`
- **Where used:** `admin/adminRoutes.js:2444`, `admin/adminRoutes.js:2481`, `admin/adminRoutes.js:3060`, `routes/h2i-route.js:67`, `routes/subscription-route.js:39`, `utils/customerKeys.js:13`

### `DB_RETENTION_LOG_PATH`
- **Tier:** DIAGNOSTICS
- **Type:** path
- **Default behavior:** null
- **What it controls:** Database connection or cleanup behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `DB_RETENTION_LOG_PATH=<value>`
- **Where used:** `utils/retentionCleanup.js:19`

### `ENABLE_DIAGNOSTICS`
- **Tier:** DIAGNOSTICS
- **Type:** string
- **Default behavior:** none
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `ENABLE_DIAGNOSTICS=<value>`
- **Where used:** `utils/config.js:131`

### `MONITORING_SNAPSHOTS_CLEANUP_INTERVAL_MS`
- **Tier:** DIAGNOSTICS
- **Type:** int
- **Default behavior:** (6 * 60 * 60 * 1000))
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `MONITORING_SNAPSHOTS_CLEANUP_INTERVAL_MS=<value>`
- **Where used:** `utils/monitoringSnapshot.js:14`, `utils/validateEnv.js:216`

### `MONITORING_SNAPSHOTS_RETENTION_HOURS`
- **Tier:** DIAGNOSTICS
- **Type:** int
- **Default behavior:** (7 * 24)) * 60 * 60 * 1000
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `MONITORING_SNAPSHOTS_RETENTION_HOURS=<value>`
- **Where used:** `utils/monitoringSnapshot.js:13`, `utils/validateEnv.js:215`

### `PIXLAB_LOG_DIR`
- **Tier:** DIAGNOSTICS
- **Type:** path
- **Default behavior:** '').trim()
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `PIXLAB_LOG_DIR=<value>`
- **Where used:** `utils/logger.js:21`

### `SNAPSHOT_BASE_URL`
- **Tier:** DIAGNOSTICS
- **Type:** url
- **Default behavior:** none
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `SNAPSHOT_BASE_URL=<value>`
- **Where used:** `utils/monitoringSnapshot.js:33`

### `SNAPSHOT_FORCE_PORT`
- **Tier:** DIAGNOSTICS
- **Type:** int
- **Default behavior:** none
- **What it controls:** Runtime/server behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `SNAPSHOT_FORCE_PORT=<value>`
- **Where used:** `utils/monitoringSnapshot.js:50`, `utils/monitoringSnapshot.js:51`

## TOOLING

### `REPRO_API_KEY`
- **Tier:** TOOLING
- **Type:** string
- **Default behavior:** none
- **What it controls:** Official script behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** secret/sensitive
- **Example:** `REPRO_API_KEY=<value>`
- **Where used:** `scripts/repro-all-endpoints.js:6`

### `REPRO_BASE_URL`
- **Tier:** TOOLING
- **Type:** url
- **Default behavior:** 'http://localhost:3005'
- **What it controls:** Official script behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `REPRO_BASE_URL=<value>`
- **Where used:** `scripts/repro-all-endpoints.js:5`

### `SIMULATE_ALERT_EMAIL_RECIPIENTS`
- **Tier:** TOOLING
- **Type:** list
- **Default behavior:** none
- **What it controls:** Official script behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `SIMULATE_ALERT_EMAIL_RECIPIENTS=<value>`
- **Where used:** `scripts/simulate-alert-notification.js:28`

### `SIMULATE_ALERT_TELEGRAM_TARGETS`
- **Tier:** TOOLING
- **Type:** list
- **Default behavior:** none
- **What it controls:** Official script behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `SIMULATE_ALERT_TELEGRAM_TARGETS=<value>`
- **Where used:** `scripts/simulate-alert-notification.js:29`

### `SMOKE_API_KEY`
- **Tier:** TOOLING
- **Type:** string
- **Default behavior:** '')
- **What it controls:** Official script behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** secret/sensitive
- **Example:** `SMOKE_API_KEY=<value>`
- **Where used:** `scripts/prod-smoke.js:18`

### `TEST_CUSTOMER_EMAIL`
- **Tier:** TOOLING
- **Type:** string
- **Default behavior:** 'test@example.com'
- **What it controls:** Official script behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `TEST_CUSTOMER_EMAIL=<value>`
- **Where used:** `scripts/customer-key-smoke.js:4`, `scripts/user-summary-smoke.js:4`

### `TEST_PLAN_SLUG`
- **Tier:** TOOLING
- **Type:** string
- **Default behavior:** 'dev-plan'
- **What it controls:** Official script behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `TEST_PLAN_SLUG=<value>`
- **Where used:** `scripts/customer-key-smoke.js:5`

### `TEST_SUBSCRIPTION_ID`
- **Tier:** TOOLING
- **Type:** string
- **Default behavior:** null
- **What it controls:** Official script behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `TEST_SUBSCRIPTION_ID=<value>`
- **Where used:** `scripts/user-summary-smoke.js:5`

### `VERIFY_BASE_URL`
- **Tier:** TOOLING
- **Type:** url
- **Default behavior:** `http://127.0.0.1:${process.env.PORT || 3005}`
- **What it controls:** Official script behavior.
- **Production guidance:** Set explicitly for production to avoid accidental fallback behavior.
- **Dev guidance:** Local defaults/fallbacks are acceptable for development and smoke tests unless testing production parity.
- **Security notes:** non-sensitive
- **Example:** `VERIFY_BASE_URL=<value>`
- **Where used:** `scripts/verify-production.js:128`
