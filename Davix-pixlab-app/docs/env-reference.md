# PixLab Environment Variable Reference

This document is the complete, code-backed environment variable reference for PixLab. Every variable listed here is discovered from the codebase and includes defaults, accepted values, and usage locations.

## Quick Start for Production

**Required in production:**
- `API_KEYS` (must be non-empty)
- `DB_HOST`, `DB_USER`, `DB_NAME`
- `SIGNED_URL_SECRET` **when** `REQUIRE_SIGNED_OUTPUT_URLS` resolves to `true` in production

**Recommended in production:**
- `SUBSCRIPTION_BRIDGE_TOKEN` (protects internal subscription/admin routes)
- `BASE_URL` (public URL for signed/static outputs)
- `REQUIRE_SIGNED_OUTPUT_URLS=1` (explicitly enforce signing)
- `H2I_BLOCK_PRIVATE_NETWORK=1` and `H2I_ALLOW_FILE_SCHEME=0`

Minimal example:
```
NODE_ENV=production
API_KEYS=sk_live_owner_...,sk_live_public_...
PUBLIC_API_KEYS=sk_live_public_...
DB_HOST=db.example.net
DB_USER=pixlab
DB_PASS=strong-password
DB_NAME=pixlab
BASE_URL=https://pixlab.example.com
REQUIRE_SIGNED_OUTPUT_URLS=1
SIGNED_URL_SECRET=long-random-secret
SUBSCRIPTION_BRIDGE_TOKEN=bridge-secret
```

## Env Inventory Summary

- **Total env vars found:** 85
- **Runtime vars:** 79
- **Scripts-only vars:** 6
- **Legacy alias pairs + precedence:**
  - `SUBSCRIPTION_BRIDGE_TOKEN` → `X_DAVIX_BRIDGE_TOKEN` (fallback) (`routes/subscription-route.js`)
  - `REPRO_API_KEY` → `API_KEY` (fallback) (`scripts/repro-all-endpoints.js`)

## Boolean Parsing Rules (Code-backed)

### `parseBooleanEnv` tokens (case-insensitive)
| Token | Meaning |
|------|---------|
| `true` | enabled / true |
| `1` | enabled / true |
| `false` | disabled / false |
| `0` | disabled / false |

- Any other value falls back to the default provided by the caller. (`utils/config.js`)

### Special boolean-like patterns
- **`EXPIRY_WATCHER_ENABLED`, `ORPHAN_CLEANUP_ENABLED`, `RETENTION_CLEANUP_ENABLED`:** only the exact string `"false"` disables; any other value enables. (`server.js`)
- **`DAVIX_DEBUG_INTERNAL`:** enabled only when the value is the exact string `"1"`. (`routes/h2i-route.js`, `routes/subscription-route.js`, `utils/customerKeys.js`)
- **`TRUST_PROXY`:** accepts `true`/`false` or a numeric hop count; other strings default to `true`. (`utils/config.js`)

## Units Reference
- **Milliseconds (ms):** `300000 ms = 5 minutes`
- **Seconds:** `60 seconds = 1 minute`
- **Hours:** `24 hours = 1 day`
- **Days:** integer day counts (UTC-based cleanup)
- **Bytes:** raw integer byte counts
- **MB:** base-10 megabytes used for upload limits (converted to bytes in code)

---

# Core

### `NODE_ENV`
- **Purpose:** toggles production-only defaults (signing, query key rules, sandbox defaults).
- **Default:** unset → treated as non-production (`isProduction` checks only `"production"`).
- **Type + Accepted values:** string enum; `production` enables prod defaults, any other value is non-production.
- **Meaning of values:** `production` = stricter defaults; other values = dev defaults.
- **How to set:** `NODE_ENV=production`
- **Behavior impact:** changes defaults for signing, query key disabling, sandbox settings.
- **Security / production notes:** set to `production` in live environments.
- **Where used:** `utils/config.js:L3-L5`

### `PORT`
- **Purpose:** API server listen port.
- **Default:** `3005`.
- **Type + Accepted values:** integer (base-10 TCP port).
- **Meaning of values:** `3005` = listen on port 3005.
- **How to set:** `PORT=3005`
- **Behavior impact:** changes server listen port.
- **Security / production notes:** ensure firewall/LB allows the chosen port.
- **Where used:** `server.js:L31`

### `BASE_URL`
- **Purpose:** base URL used when constructing output URLs (signed or unsigned).
- **Default:** `http://localhost:${PORT}`.
- **Type + Accepted values:** string URL with scheme/host/port.
- **Meaning of values:** e.g., `https://pixlab.example.com`.
- **How to set:** `BASE_URL=https://pixlab.example.com`
- **Behavior impact:** changes URLs returned in API responses.
- **Security / production notes:** should be the public HTTPS URL in production.
- **Where used:** `server.js:L82-L83`, `scripts/customer-key-smoke.js:L2`, `scripts/user-summary-smoke.js:L2`

### `TRUST_PROXY`
- **Purpose:** configures Express trust proxy behavior for client IP resolution.
- **Default:** `true`.
- **Type + Accepted values:** boolean (`true`/`false`) or integer hop count (string).
- **Meaning of values:** `true`=trust proxy headers, `false`=ignore, `N`=trust N hops.
- **How to set:** `TRUST_PROXY=1` or `TRUST_PROXY=2`.
- **Behavior impact:** affects `req.ip` and rate-limit client IP.
- **Security / production notes:** set appropriately when behind a reverse proxy.
- **Where used:** `utils/config.js:L34-L42`, `server.js:L71`

# CORS

### `CORS_ORIGINS`
- **Purpose:** allowlist of browser origins for CORS.
- **Default:** `https://h2i.davix.dev,https://davix.dev,https://www.davix.dev`.
- **Type + Accepted values:** comma-separated list of origins; values are trimmed.
- **Meaning of values:** allowed `Origin` headers.
- **How to set:** `CORS_ORIGINS=https://app.example.com,https://www.example.com`
- **Behavior impact:** controls `Access-Control-Allow-Origin` responses.
- **Security / production notes:** limit to known domains to avoid abuse.
- **Where used:** `server.js:L109-L113`

# Auth & Keys

### `API_KEYS`
- **Purpose:** primary allowlist of valid API keys.
- **Default:** empty string.
- **Type + Accepted values:** list separated by commas or whitespace; trimmed; empty entries removed.
- **Meaning of values:** any key in the list is accepted as owner/public.
- **How to set:** `API_KEYS=owner_key_1,public_key_2`
- **Behavior impact:** controls which keys can access the API.
- **Security / production notes:** **required in production**; store securely.
- **Where used:** `server.js:L223-L229`, `utils/validateEnv.js:L7-L11`

### `PUBLIC_API_KEYS`
- **Purpose:** marks a subset of `API_KEYS` as public keys (subject to public limits).
- **Default:** empty string.
- **Type + Accepted values:** list separated by commas or whitespace; trimmed.
- **Meaning of values:** keys in this list are treated as `public`.
- **How to set:** `PUBLIC_API_KEYS=public_key_2`
- **Behavior impact:** changes rate-limit behavior to public limits.
- **Security / production notes:** keep aligned with `API_KEYS` list.
- **Where used:** `server.js:L227-L231`

### `DISABLE_QUERY_API_KEY_IN_PROD`
- **Purpose:** disables `?key=` query-string API key usage in production.
- **Default:** `true` (via `parseBooleanEnv`).
- **Type + Accepted values:** boolean tokens `true/false/1/0` (case-insensitive).
- **Meaning of values:** `1/true`=disable query key in prod; `0/false`=allow.
- **How to set:** `DISABLE_QUERY_API_KEY_IN_PROD=1`
- **Behavior impact:** blocks or allows query-string key usage in production only.
- **Security / production notes:** keep enabled to avoid leakage via URL logs.
- **Where used:** `utils/config.js:L60-L62`, `server.js:L243-L255`

### `SUBSCRIPTION_BRIDGE_TOKEN`
- **Purpose:** shared secret for internal subscription/admin routes.
- **Default:** empty string (warning in production if missing).
- **Type + Accepted values:** string token.
- **Meaning of values:** exact header match required for access.
- **How to set:** `SUBSCRIPTION_BRIDGE_TOKEN=your-secret-token`
- **Behavior impact:** gates `/internal/*` routes.
- **Security / production notes:** required for internal routes; keep secret.
- **Where used:** `server.js:L115-L121`, `routes/subscription-route.js:L465-L494`, `scripts/customer-key-smoke.js:L3`, `scripts/user-summary-smoke.js:L3`

### `X_DAVIX_BRIDGE_TOKEN`
- **Purpose:** legacy fallback for bridge token.
- **Default:** empty string.
- **Type + Accepted values:** string token.
- **Meaning of values:** used only when `SUBSCRIPTION_BRIDGE_TOKEN` is unset.
- **How to set:** `X_DAVIX_BRIDGE_TOKEN=legacy-token`
- **Behavior impact:** fallback authentication for internal routes/scripts.
- **Security / production notes:** prefer `SUBSCRIPTION_BRIDGE_TOKEN`.
- **Where used:** `routes/subscription-route.js:L465`, `scripts/customer-key-smoke.js:L3`, `scripts/user-summary-smoke.js:L3`

# Database

### `DB_HOST`
- **Purpose:** database host.
- **Default:** `localhost`.
- **Type + Accepted values:** string host or IP.
- **Meaning of values:** DB server address.
- **How to set:** `DB_HOST=db.example.net`
- **Behavior impact:** selects DB host.
- **Security / production notes:** **required in production**.
- **Where used:** `db.js:L6`, `utils/validateEnv.js:L7-L11`

### `DB_USER`
- **Purpose:** database username.
- **Default:** `root`.
- **Type + Accepted values:** string username.
- **Meaning of values:** DB auth user.
- **How to set:** `DB_USER=pixlab`
- **Behavior impact:** selects DB auth user.
- **Security / production notes:** **required in production**.
- **Where used:** `db.js:L7`, `utils/validateEnv.js:L7-L11`

### `DB_PASS`
- **Purpose:** database password.
- **Default:** empty string.
- **Type + Accepted values:** string password.
- **Meaning of values:** password for `DB_USER`.
- **How to set:** `DB_PASS=strong-password`
- **Behavior impact:** DB authentication.
- **Security / production notes:** store securely.
- **Where used:** `db.js:L8`

### `DB_NAME`
- **Purpose:** database schema name.
- **Default:** `pixlab`.
- **Type + Accepted values:** string.
- **Meaning of values:** DB name to use.
- **How to set:** `DB_NAME=pixlab`
- **Behavior impact:** selects target database.
- **Security / production notes:** **required in production**.
- **Where used:** `db.js:L9`, `utils/validateEnv.js:L7-L11`

# Signing & Outputs

### `REQUIRE_SIGNED_OUTPUT_URLS`
- **Purpose:** toggles signed URL enforcement for static outputs.
- **Default:** `true` in production, `false` otherwise.
- **Type + Accepted values:** boolean tokens `true/false/1/0`.
- **Meaning of values:** `1/true`=require signed URLs; `0/false`=unsigned allowed.
- **How to set:** `REQUIRE_SIGNED_OUTPUT_URLS=1`
- **Behavior impact:** enforces signed URL checks for output directories.
- **Security / production notes:** keep enabled in production.
- **Where used:** `utils/config.js:L45-L47`, `server.js:L98-L104`, `utils/validateEnv.js:L13-L16`

### `SIGNED_URL_SECRET`
- **Purpose:** HMAC secret used to sign output URLs.
- **Default:** empty string.
- **Type + Accepted values:** non-empty string.
- **Meaning of values:** shared secret for signing/verification.
- **How to set:** `SIGNED_URL_SECRET=long-random-secret`
- **Behavior impact:** enables signing and verification of output URLs.
- **Security / production notes:** **required in production when signing is enabled**; keep secret.
- **Where used:** `utils/config.js:L50-L54`, `utils/validateEnv.js:L13-L16`

### `SIGNED_URL_TTL_SECONDS`
- **Purpose:** signed URL lifetime.
- **Default:** `86400` seconds.
- **Type + Accepted values:** integer seconds.
- **Meaning of values:** `86400 = 24 hours`.
- **How to set:** `SIGNED_URL_TTL_SECONDS=3600`
- **Behavior impact:** changes expiration time for signed URLs.
- **Security / production notes:** shorter TTL reduces exposure.
- **Where used:** `utils/config.js:L50-L55`

### `SIGNED_URL_ALGO`
- **Purpose:** HMAC hash algorithm for signing.
- **Default:** `sha256`.
- **Type + Accepted values:** string; any algorithm supported by Node crypto HMAC.
- **Meaning of values:** `sha256` = HMAC-SHA256.
- **How to set:** `SIGNED_URL_ALGO=sha512`
- **Behavior impact:** changes signature algorithm (must match verifier).
- **Security / production notes:** use modern algorithms (sha256/sha512).
- **Where used:** `utils/config.js:L50-L56`

### `OUTPUT_CACHE_CONTROL`
- **Purpose:** Cache-Control header for static output files.
- **Default:** `private, no-store`.
- **Type + Accepted values:** string Cache-Control value.
- **Meaning of values:** controls client/proxy caching.
- **How to set:** `OUTPUT_CACHE_CONTROL=private, max-age=3600`
- **Behavior impact:** changes caching behavior for static outputs.
- **Security / production notes:** use no-store when outputs are sensitive.
- **Where used:** `utils/config.js:L50-L56`

### `PUBLIC_FILE_TTL_HOURS`
- **Purpose:** cleanup TTL for output files stored on disk.
- **Default:** `24` hours.
- **Type + Accepted values:** integer hours > 0.
- **Meaning of values:** `24 = 1 day`.
- **How to set:** `PUBLIC_FILE_TTL_HOURS=12`
- **Behavior impact:** controls how long outputs remain on disk.
- **Security / production notes:** shorter TTL reduces data retention exposure.
- **Where used:** `server.js:L310-L315`

# H2I / Puppeteer / SSRF

### `MAX_HTML_CHARS`
- **Purpose:** cap HTML payload size for H2I.
- **Default:** `100000`.
- **Type + Accepted values:** integer > 0.
- **Meaning of values:** max characters allowed.
- **How to set:** `MAX_HTML_CHARS=50000`
- **Behavior impact:** rejects larger HTML payloads.
- **Security / production notes:** lower to reduce abuse surface.
- **Where used:** `routes/h2i-route.js:L41-L43`

### `MAX_RENDER_PIXELS`
- **Purpose:** cap total render pixel count.
- **Default:** `20000000`.
- **Type + Accepted values:** integer > 0.
- **Meaning of values:** max width × height.
- **How to set:** `MAX_RENDER_PIXELS=12000000`
- **Behavior impact:** rejects oversized render requests.
- **Security / production notes:** reduce to avoid resource exhaustion.
- **Where used:** `routes/h2i-route.js:L42-L45`

### `MAX_RENDER_WIDTH`
- **Purpose:** max render width for H2I.
- **Default:** `5000`.
- **Type + Accepted values:** integer > 0.
- **Meaning of values:** max width in pixels.
- **How to set:** `MAX_RENDER_WIDTH=3000`
- **Behavior impact:** caps width in render requests.
- **Security / production notes:** lower to mitigate memory usage.
- **Where used:** `routes/h2i-route.js:L43-L45`

### `MAX_RENDER_HEIGHT`
- **Purpose:** max render height for H2I.
- **Default:** `8000`.
- **Type + Accepted values:** integer > 0.
- **Meaning of values:** max height in pixels.
- **How to set:** `MAX_RENDER_HEIGHT=4000`
- **Behavior impact:** caps height in render requests.
- **Security / production notes:** lower to mitigate memory usage.
- **Where used:** `routes/h2i-route.js:L44-L45`

### `H2I_BLOCK_PRIVATE_NETWORK`
- **Purpose:** blocks private/localhost SSRF targets during H2I rendering.
- **Default:** `true`.
- **Type + Accepted values:** boolean tokens `true/false/1/0`.
- **Meaning of values:** `true`=block private network; `false`=allow.
- **How to set:** `H2I_BLOCK_PRIVATE_NETWORK=1`
- **Behavior impact:** prevents access to internal IP ranges.
- **Security / production notes:** keep enabled in production.
- **Where used:** `utils/config.js:L64-L67`

### `H2I_ALLOW_FILE_SCHEME`
- **Purpose:** allows or blocks `file:` URLs in H2I.
- **Default:** `false`.
- **Type + Accepted values:** boolean tokens `true/false/1/0`.
- **Meaning of values:** `true`=allow file URLs; `false`=block.
- **How to set:** `H2I_ALLOW_FILE_SCHEME=0`
- **Behavior impact:** controls local file access by renderer.
- **Security / production notes:** keep disabled to prevent file exfiltration.
- **Where used:** `utils/config.js:L64-L67`

### `H2I_DNS_REBINDING_MODE`
- **Purpose:** DNS rebinding defense mode for H2I.
- **Default:** `strict` in production when `H2I_BLOCK_PRIVATE_NETWORK=true`, otherwise `off`.
- **Type + Accepted values:** enum `off`, `strict`, `pin`.
- **Meaning of values:** `off`=cache DNS; `strict`=re-resolve per request; `pin`=pin first resolution.
- **How to set:** `H2I_DNS_REBINDING_MODE=strict`
- **Behavior impact:** controls DNS resolution behavior and SSRF protection.
- **Security / production notes:** use `strict` or `pin` in production.
- **Where used:** `utils/config.js:L105-L109`

### `PUPPETEER_NO_SANDBOX`
- **Purpose:** toggles Chromium sandbox flags.
- **Default:** `true` in non-production, `false` in production.
- **Type + Accepted values:** boolean tokens `true/false/1/0`.
- **Meaning of values:** `true`=disable sandbox; `false`=enable sandbox.
- **How to set:** `PUPPETEER_NO_SANDBOX=0`
- **Behavior impact:** adds/removes `--no-sandbox` flags.
- **Security / production notes:** keep sandbox enabled in production.
- **Where used:** `utils/config.js:L71-L74`

# Limits & Uploads

### `BODY_PARSER_JSON_LIMIT`
- **Purpose:** max JSON body size accepted by body-parser.
- **Default:** `20mb`.
- **Type + Accepted values:** size string supported by body-parser (e.g., `100kb`, `1mb`, `20mb`).
- **Meaning of values:** `20mb` = 20 megabytes.
- **How to set:** `BODY_PARSER_JSON_LIMIT=5mb`
- **Behavior impact:** caps JSON body size.
- **Security / production notes:** lower to reduce memory pressure.
- **Where used:** `utils/limits.js:L39-L41`, `server.js:L146-L149`

### `MAX_UPLOAD_BYTES`
- **Purpose:** per-file upload size cap.
- **Default:** 10MB when unset/invalid.
- **Type + Accepted values:** integer bytes.
- **Meaning of values:** `10485760` = 10MB.
- **How to set:** `MAX_UPLOAD_BYTES=5242880`
- **Behavior impact:** rejects files larger than this limit.
- **Security / production notes:** keep conservative to reduce abuse.
- **Where used:** `utils/limits.js:L132-L136`

# Timeouts

### `PUBLIC_TIMEOUT_MS`
- **Purpose:** request timeout for public keys.
- **Default:** `30000` ms.
- **Type + Accepted values:** integer milliseconds.
- **Meaning of values:** `30000 = 30 seconds`.
- **How to set:** `PUBLIC_TIMEOUT_MS=20000`
- **Behavior impact:** enforces timeout for public API requests.
- **Security / production notes:** lower reduces long-running abuse.
- **Where used:** `utils/limits.js:L52-L55`

### `OWNER_TIMEOUT_MS`
- **Purpose:** request timeout for owner keys.
- **Default:** `300000` ms.
- **Type + Accepted values:** integer milliseconds.
- **Meaning of values:** `300000 = 5 minutes`.
- **How to set:** `OWNER_TIMEOUT_MS=120000`
- **Behavior impact:** enforces timeout for owner API requests.
- **Security / production notes:** adjust based on workload.
- **Where used:** `utils/limits.js:L56-L58`

# Upload limits (public)

### `PUBLIC_IMAGE_MAX_FILES_PER_REQ`
- **Purpose:** max image files per public request.
- **Default:** `10`.
- **Type + Accepted values:** integer count.
- **Meaning of values:** `10` files per request.
- **How to set:** `PUBLIC_IMAGE_MAX_FILES_PER_REQ=5`
- **Behavior impact:** rejects requests exceeding count.
- **Security / production notes:** lower reduces upload abuse.
- **Where used:** `utils/limits.js:L84-L89`

### `PUBLIC_IMAGE_MAX_TOTAL_UPLOAD_MB`
- **Purpose:** max total upload MB for public image requests.
- **Default:** `10`.
- **Type + Accepted values:** integer MB.
- **Meaning of values:** `10MB` total per request.
- **How to set:** `PUBLIC_IMAGE_MAX_TOTAL_UPLOAD_MB=5`
- **Behavior impact:** rejects requests exceeding total size.
- **Security / production notes:** lower reduces bandwidth abuse.
- **Where used:** `utils/limits.js:L84-L89`

### `PUBLIC_IMAGE_MAX_DIMENSION_PX`
- **Purpose:** max image dimension for public image requests.
- **Default:** `6000`.
- **Type + Accepted values:** integer pixels.
- **Meaning of values:** max width/height.
- **How to set:** `PUBLIC_IMAGE_MAX_DIMENSION_PX=4000`
- **Behavior impact:** rejects oversized images.
- **Security / production notes:** lower reduces memory usage.
- **Where used:** `utils/limits.js:L84-L90`

### `PUBLIC_PDF_MAX_FILES_PER_REQ`
- **Purpose:** max PDF files per public request.
- **Default:** `10`.
- **Type + Accepted values:** integer count.
- **Meaning of values:** `10` files per request.
- **How to set:** `PUBLIC_PDF_MAX_FILES_PER_REQ=5`
- **Behavior impact:** rejects requests exceeding count.
- **Security / production notes:** lower reduces upload abuse.
- **Where used:** `utils/limits.js:L90-L94`

### `PUBLIC_PDF_MAX_TOTAL_UPLOAD_MB`
- **Purpose:** max total upload MB for public PDF requests.
- **Default:** `10`.
- **Type + Accepted values:** integer MB.
- **Meaning of values:** `10MB` total per request.
- **How to set:** `PUBLIC_PDF_MAX_TOTAL_UPLOAD_MB=5`
- **Behavior impact:** rejects requests exceeding total size.
- **Security / production notes:** lower reduces bandwidth abuse.
- **Where used:** `utils/limits.js:L90-L94`

### `PUBLIC_TOOLS_MAX_FILES_PER_REQ`
- **Purpose:** max files per public tools request.
- **Default:** `10`.
- **Type + Accepted values:** integer count.
- **Meaning of values:** `10` files per request.
- **How to set:** `PUBLIC_TOOLS_MAX_FILES_PER_REQ=5`
- **Behavior impact:** rejects requests exceeding count.
- **Security / production notes:** lower reduces abuse.
- **Where used:** `utils/limits.js:L96-L99`

### `PUBLIC_TOOLS_MAX_TOTAL_UPLOAD_MB`
- **Purpose:** max total upload MB for public tools requests.
- **Default:** `10`.
- **Type + Accepted values:** integer MB.
- **Meaning of values:** `10MB` total per request.
- **How to set:** `PUBLIC_TOOLS_MAX_TOTAL_UPLOAD_MB=5`
- **Behavior impact:** rejects requests exceeding total size.
- **Security / production notes:** lower reduces bandwidth abuse.
- **Where used:** `utils/limits.js:L96-L99`

### `PUBLIC_TOOLS_MAX_DIMENSION_PX`
- **Purpose:** max image dimension for public tools requests.
- **Default:** `6000`.
- **Type + Accepted values:** integer pixels.
- **Meaning of values:** max width/height.
- **How to set:** `PUBLIC_TOOLS_MAX_DIMENSION_PX=4000`
- **Behavior impact:** rejects oversized images.
- **Security / production notes:** lower reduces memory usage.
- **Where used:** `utils/limits.js:L96-L99`

# Upload limits (owner)

### `OWNER_MAX_FILES_PER_REQ`
- **Purpose:** max files per owner request.
- **Default:** `50`.
- **Type + Accepted values:** integer count.
- **Meaning of values:** `50` files per request.
- **How to set:** `OWNER_MAX_FILES_PER_REQ=100`
- **Behavior impact:** caps owner file count per request.
- **Security / production notes:** owners are otherwise unlimited; set for safety.
- **Where used:** `utils/limits.js:L121-L127`

### `OWNER_IMAGE_MAX_TOTAL_UPLOAD_MB`
- **Purpose:** max total upload MB for owner image requests.
- **Default:** unlimited (null).
- **Type + Accepted values:** integer MB.
- **Meaning of values:** blank=unlimited.
- **How to set:** `OWNER_IMAGE_MAX_TOTAL_UPLOAD_MB=200`
- **Behavior impact:** caps total size for owner image uploads.
- **Security / production notes:** set if you want upper bounds.
- **Where used:** `utils/limits.js:L105-L128`

### `OWNER_IMAGE_MAX_DIMENSION_PX`
- **Purpose:** max image dimension for owner image requests.
- **Default:** unlimited (null).
- **Type + Accepted values:** integer pixels.
- **Meaning of values:** blank=unlimited.
- **How to set:** `OWNER_IMAGE_MAX_DIMENSION_PX=12000`
- **Behavior impact:** caps owner image dimensions.
- **Security / production notes:** set if needed.
- **Where used:** `utils/limits.js:L105-L129`

### `OWNER_PDF_MAX_TOTAL_UPLOAD_MB`
- **Purpose:** max total upload MB for owner PDF requests.
- **Default:** unlimited (null).
- **Type + Accepted values:** integer MB.
- **Meaning of values:** blank=unlimited.
- **How to set:** `OWNER_PDF_MAX_TOTAL_UPLOAD_MB=200`
- **Behavior impact:** caps owner PDF upload size.
- **Security / production notes:** set if needed.
- **Where used:** `utils/limits.js:L111-L128`

### `OWNER_TOOLS_MAX_TOTAL_UPLOAD_MB`
- **Purpose:** max total upload MB for owner tools requests.
- **Default:** unlimited (null).
- **Type + Accepted values:** integer MB.
- **Meaning of values:** blank=unlimited.
- **How to set:** `OWNER_TOOLS_MAX_TOTAL_UPLOAD_MB=200`
- **Behavior impact:** caps owner tools upload size.
- **Security / production notes:** set if needed.
- **Where used:** `utils/limits.js:L115-L128`

### `OWNER_TOOLS_MAX_DIMENSION_PX`
- **Purpose:** max image dimension for owner tools requests.
- **Default:** unlimited (null).
- **Type + Accepted values:** integer pixels.
- **Meaning of values:** blank=unlimited.
- **How to set:** `OWNER_TOOLS_MAX_DIMENSION_PX=12000`
- **Behavior impact:** caps owner tools image dimensions.
- **Security / production notes:** set if needed.
- **Where used:** `utils/limits.js:L115-L128`

# Global ceilings

### `GLOBAL_MAX_TOTAL_UPLOAD_MB`
- **Purpose:** global cap on total upload size per request.
- **Default:** unlimited (null when unset or <=0).
- **Type + Accepted values:** float MB > 0.
- **Meaning of values:** `50` = 50MB max per request.
- **How to set:** `GLOBAL_MAX_TOTAL_UPLOAD_MB=50`
- **Behavior impact:** caps total upload size regardless of endpoint limits.
- **Security / production notes:** useful for global abuse control.
- **Where used:** `utils/config.js:L76-L80`, `utils/limits.js:L167-L186`

### `GLOBAL_MAX_FILES_PER_REQ`
- **Purpose:** global cap on files per request.
- **Default:** unlimited (null when unset or <=0).
- **Type + Accepted values:** integer count > 0.
- **Meaning of values:** `20` files per request.
- **How to set:** `GLOBAL_MAX_FILES_PER_REQ=20`
- **Behavior impact:** caps file count for all endpoints.
- **Security / production notes:** useful for global abuse control.
- **Where used:** `utils/config.js:L76-L80`, `utils/limits.js:L167-L177`

# Rate limits (public)

### `PUBLIC_H2I_DAILY_LIMIT`
- **Purpose:** public daily limit for `/v1/h2i`.
- **Default:** `5`.
- **Type + Accepted values:** integer > 0.
- **Meaning of values:** 5 calls/day per IP.
- **How to set:** `PUBLIC_H2I_DAILY_LIMIT=20`
- **Behavior impact:** increases/decreases public daily allowance.
- **Security / production notes:** keep low for anonymous usage.
- **Where used:** `routes/h2i-route.js:L41-L42`

### `PUBLIC_IMAGE_DAILY_LIMIT`
- **Purpose:** public daily file limit for `/v1/image`.
- **Default:** `10`.
- **Type + Accepted values:** integer > 0.
- **Meaning of values:** 10 files/day per IP.
- **How to set:** `PUBLIC_IMAGE_DAILY_LIMIT=50`
- **Behavior impact:** changes public daily image quota.
- **Security / production notes:** keep low for public tier.
- **Where used:** `routes/image-route.js:L29-L31`

### `PUBLIC_PDF_DAILY_LIMIT`
- **Purpose:** public daily file limit for `/v1/pdf`.
- **Default:** `10`.
- **Type + Accepted values:** integer > 0.
- **Meaning of values:** 10 files/day per IP.
- **How to set:** `PUBLIC_PDF_DAILY_LIMIT=50`
- **Behavior impact:** changes public daily PDF quota.
- **Security / production notes:** keep low for public tier.
- **Where used:** `routes/pdf-route.js:L31-L32`

### `PUBLIC_TOOLS_DAILY_LIMIT`
- **Purpose:** public daily file limit for `/v1/tools`.
- **Default:** `10`.
- **Type + Accepted values:** integer > 0.
- **Meaning of values:** 10 files/day per IP.
- **How to set:** `PUBLIC_TOOLS_DAILY_LIMIT=50`
- **Behavior impact:** changes public daily tools quota.
- **Security / production notes:** keep low for public tier.
- **Where used:** `routes/tools-route.js:L44-L45`

# Burst limits (customer)

### `CUSTOMER_BURST_LIMIT_PER_MIN`
- **Purpose:** customer burst limit in requests per window.
- **Default:** `0` (disabled).
- **Type + Accepted values:** integer >= 0.
- **Meaning of values:** `0`=disabled; `60`=limit to 60 requests per window.
- **How to set:** `CUSTOMER_BURST_LIMIT_PER_MIN=60`
- **Behavior impact:** enables customer burst throttling.
- **Security / production notes:** set to protect infrastructure.
- **Where used:** `utils/config.js:L83-L87`

### `CUSTOMER_BURST_WINDOW_SECONDS`
- **Purpose:** window size for customer burst counting.
- **Default:** `60` seconds.
- **Type + Accepted values:** integer seconds > 0.
- **Meaning of values:** `60 = 1 minute`.
- **How to set:** `CUSTOMER_BURST_WINDOW_SECONDS=120`
- **Behavior impact:** changes the burst limiter time window.
- **Security / production notes:** align with customer expectations.
- **Where used:** `utils/config.js:L83-L87`

### `CUSTOMER_BURST_APPLIES_TO`
- **Purpose:** controls which endpoints burst limits apply to.
- **Default:** `h2i` (any non-`all` value becomes `h2i`).
- **Type + Accepted values:** enum `h2i`, `all`.
- **Meaning of values:** `h2i`=limit only `/v1/h2i`; `all`=all endpoints.
- **How to set:** `CUSTOMER_BURST_APPLIES_TO=all`
- **Behavior impact:** scopes burst limiter behavior.
- **Security / production notes:** use `all` for stricter control.
- **Where used:** `utils/config.js:L90-L93`

### `RATE_LIMIT_DB_FAILURE_MODE`
- **Purpose:** behavior when DB-backed daily limiter fails.
- **Default:** `memory`.
- **Type + Accepted values:** enum `memory`, `open`, `closed`.
- **Meaning of values:** `memory`=fallback to in-memory; `open`=allow; `closed`=reject.
- **How to set:** `RATE_LIMIT_DB_FAILURE_MODE=memory`
- **Behavior impact:** controls failure behavior for daily limiter.
- **Security / production notes:** `memory` is safest balance.
- **Where used:** `utils/config.js:L95-L98`

# Retention & Cleanup

### `EXPIRY_WATCHER_ENABLED`
- **Purpose:** toggles the expiry watcher job.
- **Default:** enabled unless set to `"false"`.
- **Type + Accepted values:** string flag; only exact `"false"` disables.
- **Meaning of values:** `false`=disabled; anything else=enabled.
- **How to set:** `EXPIRY_WATCHER_ENABLED=false`
- **Behavior impact:** stops/starts expiry watcher process.
- **Security / production notes:** disabling may leave expired keys active longer.
- **Where used:** `server.js:L32`

### `EXPIRY_WATCHER_INTERVAL_MS`
- **Purpose:** expiry watcher interval.
- **Default:** `600000` ms.
- **Type + Accepted values:** integer milliseconds.
- **Meaning of values:** `600000 = 10 minutes`.
- **How to set:** `EXPIRY_WATCHER_INTERVAL_MS=300000`
- **Behavior impact:** changes how frequently expiry watcher runs.
- **Security / production notes:** too large delays expiration handling.
- **Where used:** `server.js:L33`

### `EXPIRY_WATCHER_BATCH_SIZE`
- **Purpose:** expiry watcher batch size.
- **Default:** `500`.
- **Type + Accepted values:** integer count.
- **Meaning of values:** `500` records per run.
- **How to set:** `EXPIRY_WATCHER_BATCH_SIZE=1000`
- **Behavior impact:** changes batch size for expiry processing.
- **Security / production notes:** higher batch sizes increase DB load.
- **Where used:** `server.js:L34`

### `ORPHAN_CLEANUP_ENABLED`
- **Purpose:** toggles orphan cleanup job.
- **Default:** enabled unless set to `"false"`.
- **Type + Accepted values:** string flag; only exact `"false"` disables.
- **Meaning of values:** `false`=disabled; anything else=enabled.
- **How to set:** `ORPHAN_CLEANUP_ENABLED=false`
- **Behavior impact:** stops/starts orphan cleanup.
- **Security / production notes:** disabling may leave orphan records.
- **Where used:** `server.js:L35`

### `ORPHAN_CLEANUP_INTERVAL_MS`
- **Purpose:** orphan cleanup interval.
- **Default:** `86400000` ms.
- **Type + Accepted values:** integer milliseconds.
- **Meaning of values:** `86400000 = 24 hours`.
- **How to set:** `ORPHAN_CLEANUP_INTERVAL_MS=43200000`
- **Behavior impact:** changes cleanup cadence.
- **Security / production notes:** shorter intervals increase DB load.
- **Where used:** `server.js:L36`, `utils/orphanCleanup.js:L3-L5`

### `ORPHAN_CLEANUP_INITIAL_DELAY_MS`
- **Purpose:** initial delay before first orphan cleanup.
- **Default:** `300000` ms.
- **Type + Accepted values:** integer milliseconds.
- **Meaning of values:** `300000 = 5 minutes`.
- **How to set:** `ORPHAN_CLEANUP_INITIAL_DELAY_MS=60000`
- **Behavior impact:** delays initial cleanup run.
- **Security / production notes:** set to avoid startup spikes.
- **Where used:** `server.js:L38`, `utils/orphanCleanup.js:L3-L5`

### `ORPHAN_CLEANUP_BATCH`
- **Purpose:** batch size for orphan cleanup deletions.
- **Default:** `5000`.
- **Type + Accepted values:** integer count.
- **Meaning of values:** `5000` rows per batch.
- **How to set:** `ORPHAN_CLEANUP_BATCH=1000`
- **Behavior impact:** controls deletion batch size.
- **Security / production notes:** lower to reduce DB load.
- **Where used:** `server.js:L37`, `utils/orphanCleanup.js:L3-L5`

### `RETENTION_CLEANUP_ENABLED`
- **Purpose:** toggles retention cleanup job.
- **Default:** enabled unless set to `"false"`.
- **Type + Accepted values:** string flag; only exact `"false"` disables.
- **Meaning of values:** `false`=disabled; anything else=enabled.
- **How to set:** `RETENTION_CLEANUP_ENABLED=false`
- **Behavior impact:** stops/starts retention cleanup.
- **Security / production notes:** disabling increases data retention.
- **Where used:** `server.js:L39`, `utils/retentionCleanup.js:L10`

### `RETENTION_CLEANUP_INTERVAL_MS`
- **Purpose:** retention cleanup interval.
- **Default:** `86400000` ms.
- **Type + Accepted values:** integer milliseconds.
- **Meaning of values:** `86400000 = 24 hours`.
- **How to set:** `RETENTION_CLEANUP_INTERVAL_MS=43200000`
- **Behavior impact:** changes retention cleanup cadence.
- **Security / production notes:** lower increases DB load.
- **Where used:** `server.js:L40`, `utils/retentionCleanup.js:L11`

### `RETENTION_INITIAL_DELAY_MS`
- **Purpose:** initial delay before first retention cleanup.
- **Default:** `60000` ms.
- **Type + Accepted values:** integer milliseconds.
- **Meaning of values:** `60000 = 1 minute`.
- **How to set:** `RETENTION_INITIAL_DELAY_MS=120000`
- **Behavior impact:** delays initial retention cleanup.
- **Security / production notes:** set to avoid startup spikes.
- **Where used:** `server.js:L41`, `utils/retentionCleanup.js:L12`

### `RETENTION_REQUEST_LOG_DAYS`
- **Purpose:** retention window for `request_log`.
- **Default:** `60` days.
- **Type + Accepted values:** integer days >= 1.
- **Meaning of values:** `60` days.
- **How to set:** `RETENTION_REQUEST_LOG_DAYS=30`
- **Behavior impact:** deletes older request_log records.
- **Security / production notes:** shorter reduces stored sensitive data.
- **Where used:** `server.js:L42`, `utils/retentionCleanup.js:L13`

### `RETENTION_USAGE_MONTHLY_MONTHS`
- **Purpose:** retention window for `usage_monthly`.
- **Default:** `6` months.
- **Type + Accepted values:** integer months >= 1.
- **Meaning of values:** `6` months.
- **How to set:** `RETENTION_USAGE_MONTHLY_MONTHS=3`
- **Behavior impact:** deletes older usage_monthly records.
- **Security / production notes:** shorter reduces stored sensitive data.
- **Where used:** `server.js:L43`, `utils/retentionCleanup.js:L14`

### `RETENTION_BATCH_REQUEST_LOG`
- **Purpose:** batch size for request_log cleanup.
- **Default:** `20000`.
- **Type + Accepted values:** integer count.
- **Meaning of values:** `20000` rows per batch.
- **How to set:** `RETENTION_BATCH_REQUEST_LOG=5000`
- **Behavior impact:** controls deletion batch size.
- **Security / production notes:** lower to reduce DB load.
- **Where used:** `server.js:L44`, `utils/retentionCleanup.js:L15`

### `RETENTION_BATCH_USAGE_MONTHLY`
- **Purpose:** batch size for usage cleanup.
- **Default:** `5000`.
- **Type + Accepted values:** integer count.
- **Meaning of values:** `5000` rows per batch.
- **How to set:** `RETENTION_BATCH_USAGE_MONTHLY=2000`
- **Behavior impact:** controls deletion batch size.
- **Security / production notes:** lower to reduce DB load.
- **Where used:** `server.js:L45`, `utils/retentionCleanup.js:L16`

### `RETENTION_RATE_LIMIT_DAYS`
- **Purpose:** shared retention fallback for rate limit tables.
- **Default:** fallback per table (2 days for daily limits, 7 days for burst limits).
- **Type + Accepted values:** integer days >= 1.
- **Meaning of values:** single value overrides per-table defaults.
- **How to set:** `RETENTION_RATE_LIMIT_DAYS=7`
- **Behavior impact:** changes fallback retention for rate/burst limit tables.
- **Security / production notes:** longer retention may increase data footprint.
- **Where used:** `utils/config.js:L117-L119`

### `RATE_LIMITS_DAILY_CLEANUP_ENABLED`
- **Purpose:** toggles cleanup for `rate_limits_daily`.
- **Default:** `true`.
- **Type + Accepted values:** boolean tokens `true/false/1/0`.
- **Meaning of values:** `true`=enable cleanup, `false`=disable.
- **How to set:** `RATE_LIMITS_DAILY_CLEANUP_ENABLED=0`
- **Behavior impact:** disables/enables daily limiter cleanup.
- **Security / production notes:** disabling can grow table indefinitely.
- **Where used:** `utils/config.js:L122-L123`

### `RATE_LIMITS_DAILY_RETENTION_DAYS`
- **Purpose:** retention window for `rate_limits_daily`.
- **Default:** `2` (or `RETENTION_RATE_LIMIT_DAYS` if set).
- **Type + Accepted values:** integer days >= 1.
- **Meaning of values:** `2` days retention.
- **How to set:** `RATE_LIMITS_DAILY_RETENTION_DAYS=3`
- **Behavior impact:** changes daily limit retention window.
- **Security / production notes:** shorter reduces data stored.
- **Where used:** `utils/config.js:L126-L129`

### `BURST_LIMITS_WINDOW_CLEANUP_ENABLED`
- **Purpose:** toggles cleanup for `burst_limits_window`.
- **Default:** `true`.
- **Type + Accepted values:** boolean tokens `true/false/1/0`.
- **Meaning of values:** `true`=enable cleanup, `false`=disable.
- **How to set:** `BURST_LIMITS_WINDOW_CLEANUP_ENABLED=0`
- **Behavior impact:** disables/enables burst limiter cleanup.
- **Security / production notes:** disabling can grow table indefinitely.
- **Where used:** `utils/config.js:L132-L133`

### `BURST_LIMITS_WINDOW_RETENTION_DAYS`
- **Purpose:** retention window for `burst_limits_window`.
- **Default:** `7` (or `RETENTION_RATE_LIMIT_DAYS` if set).
- **Type + Accepted values:** integer days >= 1.
- **Meaning of values:** `7` days retention.
- **How to set:** `BURST_LIMITS_WINDOW_RETENTION_DAYS=14`
- **Behavior impact:** changes burst limit retention window.
- **Security / production notes:** shorter reduces data stored.
- **Where used:** `utils/config.js:L136-L139`

### `RETENTION_LOG_PATH`
- **Purpose:** file path for retention cleanup log output.
- **Default:** `null` (disabled).
- **Type + Accepted values:** filesystem path string.
- **Meaning of values:** blank=disabled, path=append log lines.
- **How to set:** `RETENTION_LOG_PATH=/var/log/pixlab/retention.log`
- **Behavior impact:** enables retention logging to a file.
- **Security / production notes:** protect log file permissions.
- **Where used:** `server.js:L46`, `utils/retentionCleanup.js:L17`

# Migrations

### `AUTO_RUN_MIGRATIONS`
- **Purpose:** run SQL migrations on startup before listening.
- **Default:** `false`.
- **Type + Accepted values:** boolean tokens `true/false/1/0`.
- **Meaning of values:** `true`=run migrations; `false`=skip.
- **How to set:** `AUTO_RUN_MIGRATIONS=1`
- **Behavior impact:** applies pending migrations on startup.
- **Security / production notes:** set carefully in production environments.
- **Where used:** `utils/config.js:L101-L103`, `server.js:L525-L533`

# Debug/Logging

### `DAVIX_DEBUG_INTERNAL`
- **Purpose:** enables internal debug logging paths.
- **Default:** disabled.
- **Type + Accepted values:** string flag; only `"1"` enables.
- **Meaning of values:** `1`=enabled; any other value=disabled.
- **How to set:** `DAVIX_DEBUG_INTERNAL=1`
- **Behavior impact:** emits extra debug logs (e.g., SSRF blocks, internal bodies).
- **Security / production notes:** avoid in production to reduce log noise.
- **Where used:** `routes/h2i-route.js:L50`, `routes/subscription-route.js:L17`, `utils/customerKeys.js:L531`

# Subscription timing

### `VALID_FROM_GRACE_SECONDS`
- **Purpose:** grace window for valid-from normalization.
- **Default:** `120` seconds.
- **Type + Accepted values:** number seconds >= 0.
- **Meaning of values:** `120 = 2 minutes` grace.
- **How to set:** `VALID_FROM_GRACE_SECONDS=0`
- **Behavior impact:** affects how future valid_from timestamps are normalized.
- **Security / production notes:** lowering to 0 makes activation immediate.
- **Where used:** `utils/time.js:L3-L6`, `routes/subscription-route.js:L19-L40`

# Script helpers (scripts only)

### `REPRO_BASE_URL`
- **Purpose:** base URL for `scripts/repro-all-endpoints.js`.
- **Default:** `http://localhost:3005`.
- **Type + Accepted values:** string URL.
- **Meaning of values:** target API base URL.
- **How to set:** `REPRO_BASE_URL=https://pixlab.example.com`
- **Behavior impact:** controls target for repro script.
- **Security / production notes:** scripts only; no runtime effect.
- **Where used:** `scripts/repro-all-endpoints.js:L5`

### `REPRO_API_KEY`
- **Purpose:** API key used by repro script.
- **Default:** empty string.
- **Type + Accepted values:** string API key.
- **Meaning of values:** used to authenticate repro requests.
- **How to set:** `REPRO_API_KEY=sk_test_...`
- **Behavior impact:** enables repro script to run.
- **Security / production notes:** scripts only; protect the key.
- **Where used:** `scripts/repro-all-endpoints.js:L6`

### `API_KEY`
- **Purpose:** legacy fallback for `REPRO_API_KEY`.
- **Default:** empty string.
- **Type + Accepted values:** string API key.
- **Meaning of values:** used only if `REPRO_API_KEY` is unset.
- **How to set:** `API_KEY=sk_test_...`
- **Behavior impact:** fallback auth for repro script.
- **Security / production notes:** scripts only.
- **Where used:** `scripts/repro-all-endpoints.js:L6`

### `TEST_CUSTOMER_EMAIL`
- **Purpose:** customer email used by smoke scripts.
- **Default:** `test@example.com`.
- **Type + Accepted values:** string email.
- **Meaning of values:** identifies customer for smoke tests.
- **How to set:** `TEST_CUSTOMER_EMAIL=user@example.com`
- **Behavior impact:** controls smoke test target.
- **Security / production notes:** scripts only.
- **Where used:** `scripts/customer-key-smoke.js:L4`, `scripts/user-summary-smoke.js:L4`

### `TEST_PLAN_SLUG`
- **Purpose:** plan slug used by customer key smoke test.
- **Default:** `dev-plan`.
- **Type + Accepted values:** string slug.
- **Meaning of values:** plan to provision in smoke test.
- **How to set:** `TEST_PLAN_SLUG=starter`
- **Behavior impact:** changes plan used in smoke script.
- **Security / production notes:** scripts only.
- **Where used:** `scripts/customer-key-smoke.js:L5`

### `TEST_SUBSCRIPTION_ID`
- **Purpose:** subscription ID filter for user summary smoke test.
- **Default:** `null` (unused when empty).
- **Type + Accepted values:** string subscription ID.
- **Meaning of values:** if set, summary filters to subscription.
- **How to set:** `TEST_SUBSCRIPTION_ID=sub_123`
- **Behavior impact:** changes smoke test query scope.
- **Security / production notes:** scripts only.
- **Where used:** `scripts/user-summary-smoke.js:L5`
