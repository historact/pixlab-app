# 10) Authentication and API Key Usage

## External `/v1/*` authentication

- **(A) code-enforced**: external routes use `checkApiKey` middleware, which accepts `X-Api-Key` and `Authorization: Bearer <key>` in all environments. In non-production it also accepts `api_key` (body) and `?key=` (query). In production, body/query key locations are explicitly rejected with `api_key_location_not_allowed` (400).  
  Evidence: `server.js` (`resolveApiKey`, `checkApiKey`).
- **(A) code-enforced**: missing/invalid keys return `invalid_api_key` (401); expired customer keys return `key_expired` (401).  
  Evidence: `server.js` (`checkApiKey`).

## Internal `/internal/*` authentication

- **(A) code-enforced**: requires `x-davix-bridge-token` matching `SUBSCRIPTION_BRIDGE_TOKEN`; otherwise `unauthorized` (401).  
  Evidence: `utils/internalAuth.js` (`requireToken`).
- **(B) env-configurable**: optional IP allowlist `INTERNAL_ALLOWED_IPS`; if configured and caller IP not listed -> `ip_not_allowed` (403).  
  Evidence: `utils/internalAuth.js` (`allowlistInternalIp`).
- **(B) env-configurable**: diagnostics-only endpoints require allowlist to be non-empty (`ip_allowlist_required` if unset).  
  Evidence: `utils/internalAuth.js` (`requireAllowlistedInternalIp`).
- **(B) env-configurable**: internal rate-limit uses `INTERNAL_RATE_LIMIT_PER_MIN` + `INTERNAL_RATE_LIMIT_WINDOW_SECONDS`; violations return `internal_rate_limited` (429).  
  Evidence: `utils/internalAuth.js` (`internalRateLimit`).

## Admin `/{ADMIN_PATH}/{ADMIN_PASS}/api/*` authentication

- **(B) env-configurable path**: admin is mounted at `/${ADMIN_PATH}/${ADMIN_PASS}`, `ADMIN_PATH` defaults to `acp`; `ADMIN_PASS` has no default and must be set.  
  Evidence: `server.js` (`adminPath`, `adminPass`, `adminBase`).
- **(A) code-enforced**: admin API routes require session auth (`requireAuth`) and CSRF for state-changing POSTs.  
  Evidence: `admin/adminRoutes.js` (`csrfProtection`, `requireAuth`, route registration).
- **(A) code-enforced**: login requires password + TOTP code posted to `/login`; successful login sets `req.session.adminAuthenticated = true`.  
  Evidence: `admin/adminRoutes.js` (`router.post('/login'...)`).
- **How callers obtain cookie + CSRF**: GET login page to receive session cookie and hidden CSRF token (`req.csrfToken()`), then POST login with that token; subsequent API calls must include cookie and `X-CSRF-Token` (or `_csrf` in form body, as supported by the CSRF middleware).  
  Evidence: `admin/adminRoutes.js` (`router.get('/login')`, `csrfProtection(...)`).

## Idempotency-Key behavior

- **(A) code-enforced**: global middleware accepts `Idempotency-Key` or `X-Idempotency-Key`; validates non-empty, length 8..128, regex `[A-Za-z0-9._:-]+`; invalid values return `invalid_idempotency_key` (400). Successful parsing echoes `Idempotency-Key` response header.  
  Evidence: `server.js` (`parseIdempotencyKey`).
- **(C) convention**: dedupe use is most relevant for customer-quota endpoints (request id / idempotency key used in reserve/finalize paths).  
  Evidence: `routes/h2i-route.js`, `routes/image-route.js`, `routes/pdf-route.js`, `routes/tools-route.js`.

## Signed output URLs

- **(B) env-configurable**: outputs are built with `buildSignedUrl(...)`; static output paths (`/h2i`, `/image`, `/pdf`) are always behind `signedStaticGuard()`, and `/tools` is guarded when `REQUIRE_SIGNED_OUTPUT_URLS=true`.  
  Evidence: `server.js` (static mounts), `utils/signedUrls.js`.
- **(A) code-enforced**: guarded output fetches require valid `exp` + `sig` query pair (or equivalent signed URL format from `buildSignedUrl`).  
  Evidence: `utils/signedUrls.js` (`signedStaticGuard`, `buildSignedUrl`).

## Known unknowns

- **(D) not confirmed**: exact session cookie attributes under every deployment/proxy combination depend on runtime env (`trust proxy`, secure cookie options from session setup and env).
