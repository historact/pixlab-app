# PixLab HTTP Route Inventory (external + internal)

_Last updated: 2026-02-27._

## Notes on path resolution
- Admin routes are mounted under `adminBase = /${ADMIN_PATH}/${ADMIN_PASS}` where `ADMIN_PATH` defaults to `acp` and `ADMIN_PASS` has no default (must be set). Final admin paths are shown as `/{ADMIN_PATH}/{ADMIN_PASS}/...`. 
- API routes in `routes/*` are mounted directly on `app` (no extra prefix beyond the literal path in each module).
- `OPTIONS` preflight is handled by global CORS middleware for every path.

| METHOD + PATH (resolved) | External/Public vs Internal/Admin | Defined in (module/router/handler) | Auth requirements (+ dev fallbacks) | Accepted content type(s) | Required/optional input (high level) | Output type + signing/static guard | Known limits/gates referenced by route |
|---|---|---|---|---|---|---|---|
| OPTIONS `/*` | External + internal (all callers) | `server.js` global CORS middleware (`app.use(...)` returning `204` on `OPTIONS`) | None | None | No body expected | Empty `204` | CORS origin allowlist only |
| GET `/health` | External/public | `server.js` `app.get('/health', ...)` | None | N/A | None | JSON (`status`, `db`, `request_id`) | Canonical public healthcheck path; DB connectivity check without secret leakage |
| GET `/health/health` | External/public | `server.js` alias route | None | N/A | None | JSON (same as `/health`) | Backward-compatible alias to canonical `/health` |
| GET `/assets/*` | External/public static | `server.js` `app.use('/assets', express.static(...))` | None | N/A | path segment | Static file | None besides filesystem presence |
| GET `/h2i/*` | External/public output fetch | `server.js` static mount + `signedStaticGuard()` | Signed URL query required when signing enabled (`exp`,`sig`) | N/A | `exp`,`sig` query when `requireSignedUrls=true` | Static file; cache/security headers via `createSignedStaticHeaders` | Signature/expiry validation enforced by `signedStaticGuard` |
| GET `/image/*` | External/public output fetch (canonical image output path) | `server.js` static mount + `signedStaticGuard()` | Signed URL query required when signing enabled (`exp`,`sig`) | N/A | `exp`,`sig` query when `requireSignedUrls=true` | Static file; cache/security headers via `createSignedStaticHeaders` | Signature/expiry validation enforced by `signedStaticGuard` |
| GET `/pdf/*` | External/public output fetch | `server.js` static mount + `signedStaticGuard()` | Same as above | N/A | Same as above | Static file; signed/static headers | Same signed URL gate |
| GET `/tools/*` | External/public output fetch | `server.js` static mount for `/tools` | If `REQUIRE_SIGNED_OUTPUT_URLS=true`: signed guard required; else none | N/A | `exp`,`sig` only when signed mode enabled | Static file | Env-controlled signed URL gate |
| POST `/v1/h2i` | External/public API | `routes/h2i-route.js` `app.post('/v1/h2i', ...)` | `checkApiKey` accepts `X-Api-Key` or Bearer token; dev also allows body `api_key` and query `key`; production rejects body/query key locations | JSON, URL-encoded (`bodyParser` globals) | Required: `action` (`image`/`pdf`), `html`; Optional: css/render/pdf params | JSON; returns signed output URL in `url` via `buildSignedUrl(...)` | Endpoint enablement/plan gate (`createEndpointGuard`), per-key timeout, public daily limit, burst limiter, concurrency semaphore, quota reserve/finalize for customer keys, HTML/render size caps |
| POST `/v1/image` | External/public API | `routes/image-route.js` `app.post('/v1/image', ...)` | Same API-key behavior as `/v1/h2i` | `multipart/form-data` (upload middleware), plus form fields | Required: `action`; required file field `images`; optional `watermarkImage`; action-specific transform params | JSON; returns signed URL(s) for generated outputs, plus metadata JSON for metadata actions | Endpoint guard, upload limits (file count/size/dimensions/mime), public daily rate limit, burst limiter, concurrency semaphore, customer monthly quota, action allowlist |
| POST `/v1/pdf` | External/public API | `routes/pdf-route.js` `app.post('/v1/pdf', ...)` | Same API-key behavior as `/v1/h2i` | `multipart/form-data` (upload middleware), plus form fields | Required: `action`; required PDF upload(s); optional watermark image and action params (ranges, page options, encryption options, etc.) | JSON; returns signed URL or `results[]` URLs | Endpoint guard, PDF mime validation, upload limits, public daily limit, per-action page-count limits (`to-images`, `split`, `extract-images`), concurrency gate, customer quota |
| POST `/v1/tools` | External/public API | `routes/tools-route.js` `app.post('/v1/tools', ...)` | Same API-key behavior as `/v1/h2i` | `multipart/form-data` | Required: `action` (`single`/`multitask`), `tools`/`tools[]`, image file(s) | JSON with analysis/tool results | Endpoint guard, upload limits + mime filter, public daily limit, burst limiter, concurrency gate, customer quota |
| GET `/internal/ping` | Internal | `routes/subscription-route.js` `app.get('/internal/ping', ...internalMiddleware)` | `x-davix-bridge-token` required + optional internal IP allowlist + internal rate limit | N/A | None | JSON | Internal middleware token/IP/rate limits |
| POST `/internal/user/purge` | Internal/admin-ops | `routes/subscription-route.js` | Internal middleware (`x-davix-bridge-token`, IP, internal RL) | JSON or URL-encoded | Requires either `api_key_id`/`api_key_ids` or identity selectors (`wp_user_id`, `customer_email`, `subscription_ids`, `order_ids`); optional `reason` | JSON | Internal middleware + identifier validation |
| POST `/internal/user/lookup-key-id` | Internal | `routes/subscription-route.js` | Internal middleware | JSON or URL-encoded | Requires one identifier (`wp_user_id`/`customer_email`/`subscription_id`/`order_id`) | JSON | Internal middleware + validation |
| POST `/internal/user/summary` | Internal | `routes/subscription-route.js` | Internal middleware | JSON or URL-encoded | Requires one identity selector | JSON summary | Internal middleware + validation |
| POST `/internal/user/reconcile` | Internal | `routes/subscription-route.js` | Internal middleware | JSON or URL-encoded | Requires identifier (`wp_user_id`/email/subscription/order); optional plan and validity window fields | JSON with create/update result (+ key only when created/rotated path returns) | Internal middleware; validity-window validation; plan existence gate |
| POST `/internal/user/logs` | Internal | `routes/subscription-route.js` | Internal middleware | JSON or URL-encoded | Identifier required + optional pagination/filter window params | JSON list | Internal middleware + pagination bounds |
| POST `/internal/user/usage` | Internal | `routes/subscription-route.js` | Internal middleware | JSON or URL-encoded | Identifier required; optional `range` and `window` object | JSON timeseries | Internal middleware + range validation |
| POST `/internal/subscription/event` | Internal webhook bridge | `routes/subscription-route.js` | Internal middleware | JSON or URL-encoded | Event payload (`event/status` + identity + plan/subscription fields) | JSON | Internal middleware, idempotency/event decision flow, validation gates |
| POST `/internal/wp-sync/plan` | Internal | `routes/subscription-route.js` | Internal middleware | JSON or URL-encoded | WP user + plan mapping payload | JSON | Internal middleware + plan/identity validation |
| GET `/internal/admin/plans` | Internal/admin | `routes/subscription-route.js` | Internal middleware | N/A | Optional query none | JSON | Internal middleware |
| GET `/internal/admin/keys` | Internal/admin | `routes/subscription-route.js` | Internal middleware | N/A | Optional query `page`,`per_page`,`search` | JSON | Internal middleware + page/per_page caps |
| GET `/internal/admin/keys/export` | Internal/admin | `routes/subscription-route.js` | Internal middleware | N/A | Optional query `page`,`per_page`,`search`,`updated_after` | JSON | Internal middleware + per_page cap + ISO date validation |
| POST `/internal/admin/key/provision` | Internal/admin | `routes/subscription-route.js` | Internal middleware | JSON or URL-encoded | Required `plan_slug`; plus user identifiers and optional validity window/reactivation flag | JSON | Internal middleware + validity window validation + plan lookup |
| POST `/internal/admin/key/disable` | Internal/admin | `routes/subscription-route.js` | Internal middleware | JSON or URL-encoded | Requires one identifier (`subscription_id`/`customer_email`/`wp_user_id`) | JSON | Internal middleware + identifier validation |
| POST `/internal/admin/key/rotate` | Internal/admin | `routes/subscription-route.js` | Internal middleware | JSON or URL-encoded | Requires `subscription_id` or `customer_email` | JSON (returns new plaintext key) | Internal middleware + key existence |
| POST `/internal/user/key/rotate` | Internal | `routes/subscription-route.js` | Internal middleware | JSON or URL-encoded | Requires user identifier | JSON (returns new plaintext key) | Internal middleware + identifier validation |
| POST `/internal/user/key/toggle` | Internal | `routes/subscription-route.js` | Internal middleware | JSON or URL-encoded | Requires identifier + `action` (`enable`/`disable`) | JSON | Internal middleware + action validation + expiry check when enabling |
| GET `/internal/subscription/debug` *(diagnostics enabled only)* | Internal/diagnostics | `routes/subscription-route.js` guarded by `isDiagnosticsEnabled()` + `diagnosticsInternalMiddleware` | Requires bridge token + **mandatory** IP allowlist + internal RL | N/A | None | JSON | Route only mounted when diagnostics enabled |
| GET `/internal/admin/diagnostics/health` *(diagnostics enabled only)* | Internal/diagnostics | `server.js` | `diagnosticsInternalMiddleware` | N/A | None | JSON | Diagnostics flag + token + required IP allowlist + internal RL |
| GET `/internal/admin/diagnostics/request-log` *(diagnostics enabled only)* | Internal/diagnostics | `server.js` | `diagnosticsInternalMiddleware` | N/A | None | JSON | Same diagnostics gates |
| GET `/internal/admin/monitoring/metrics` | Internal/admin monitoring | `server.js` | `diagnosticsInternalMiddleware` | N/A | None | JSON | Token + required IP allowlist + internal RL |
| GET `/internal/admin/monitoring/snapshot-view` | Internal/admin monitoring | `server.js` | `diagnosticsInternalMiddleware` | N/A | Optional `rule_id` query | HTML | Token + required IP allowlist + internal RL |
| GET `/internal/admin/monitoring/snapshot` | Internal/admin monitoring | `server.js` | `diagnosticsInternalMiddleware` | N/A | Optional `rule_id` query | Image binary (`image/png` default) | Token + required IP allowlist + internal RL; snapshot generation can fail with `snapshot_failed` |
| GET `/internal/admin/monitoring/snapshot-debug/ping` | Internal/admin monitoring | `server.js` | `diagnosticsInternalMiddleware` | N/A | None | JSON | Token + required IP allowlist + internal RL |
| GET `/{ADMIN_PATH}/{ADMIN_PASS}/login` | Internal/admin UI | `admin/adminRoutes.js` router mounted via `app.use(adminBase, adminRouter)` | No session required; CSRF token emitted | N/A | None | HTML login page | Hidden path secret via `ADMIN_PATH`+`ADMIN_PASS` |
| POST `/{ADMIN_PATH}/{ADMIN_PASS}/login` | Internal/admin UI | `admin/adminRoutes.js` | No prior session, but CSRF middleware applies; checks password + TOTP + lockout | `application/x-www-form-urlencoded`, JSON | `password`, `totp` | Redirect/HTML on error | Login lockout/rate guard, password+TOTP verification, CSRF |
| POST `/{ADMIN_PATH}/{ADMIN_PASS}/logout` | Internal/admin UI | `admin/adminRoutes.js` | No explicit `requireAuth`; relies on session destroy behavior and CSRF middleware | form/json | none | Redirect | CSRF-protected logout endpoint; safe to call when already authenticated |
| GET `/{ADMIN_PATH}/{ADMIN_PASS}/logout` | Internal/admin UI | `admin/adminRoutes.js` | Requires admin session | N/A | none | Redirect | Session gate |
| GET `/{ADMIN_PATH}/{ADMIN_PASS}/bootstrap` | Internal/admin bootstrap | `admin/adminRoutes.js` | No session required | N/A | none | JSON | none |
| POST `/{ADMIN_PATH}/{ADMIN_PASS}/bootstrap/ack` | Internal/admin bootstrap | `admin/adminRoutes.js` | No session required; CSRF middleware applies | form/json | acknowledgement fields | JSON | CSRF |
| GET `/{ADMIN_PATH}/{ADMIN_PASS}/` | Internal/admin UI | `admin/adminRoutes.js` | Admin session required (`req.session.adminAuthenticated`) | N/A | none | HTML dashboard | Session gate |
| GET `/{ADMIN_PATH}/{ADMIN_PASS}/debug/admin-script` | Internal/admin | `admin/adminRoutes.js` | Session required | N/A | none | JS/text payload | Session gate |
| GET `/{ADMIN_PATH}/{ADMIN_PASS}/api/settings` | Internal/admin API | `admin/adminRoutes.js` | Session required | N/A | none | JSON | Session gate |
| GET `/{ADMIN_PATH}/{ADMIN_PASS}/api/logs/:channel` | Internal/admin API | `admin/adminRoutes.js` | Session required | N/A | `channel`, optional paging query | JSON | Session gate |
| POST `/{ADMIN_PATH}/{ADMIN_PASS}/api/logs/:channel/settings` | Internal/admin API | `admin/adminRoutes.js` | Session required + CSRF | form/json | channel log settings payload | JSON | Session gate |
| POST `/{ADMIN_PATH}/{ADMIN_PASS}/api/logs/:channel/clear` | Internal/admin API | `admin/adminRoutes.js` | Session required + CSRF | form/json | optional clear filters | JSON | Session gate |
| GET `/{ADMIN_PATH}/{ADMIN_PASS}/api/logs/:channel/export` | Internal/admin API | `admin/adminRoutes.js` | Session required | N/A | `channel` + optional query filters | file/JSON export payload | Session gate |
| GET `/{ADMIN_PATH}/{ADMIN_PASS}/api/subscription-events/settings` | Internal/admin API | `admin/adminRoutes.js` | Session required | N/A | none | JSON | Session gate |
| POST `/{ADMIN_PATH}/{ADMIN_PASS}/api/subscription-events/settings` | Internal/admin API | `admin/adminRoutes.js` | Session required + CSRF | form/json | settings payload | JSON | Session gate |
| GET `/{ADMIN_PATH}/{ADMIN_PASS}/api/subscription-events` | Internal/admin API | `admin/adminRoutes.js` | Session required | N/A | optional pagination/filter query | JSON | Session gate |
| GET `/{ADMIN_PATH}/{ADMIN_PASS}/api/subscription-events/export` | Internal/admin API | `admin/adminRoutes.js` | Session required | N/A | optional query | file/JSON export payload | Session gate |
| POST `/{ADMIN_PATH}/{ADMIN_PASS}/api/subscription-events/clear` | Internal/admin API | `admin/adminRoutes.js` | Session required + CSRF | form/json | clear options | JSON | Session gate |
| POST `/{ADMIN_PATH}/{ADMIN_PASS}/api/alerts/settings` | Internal/admin API | `admin/adminRoutes.js` | Session required + CSRF | form/json | alerts config | JSON | Session gate |
| POST `/{ADMIN_PATH}/{ADMIN_PASS}/api/alerts/test` | Internal/admin API | `admin/adminRoutes.js` | Session required + CSRF | form/json | test-alert payload | JSON | Session gate |
| GET `/{ADMIN_PATH}/{ADMIN_PASS}/api/monitoring/metrics` | Internal/admin monitoring API | `admin/adminRoutes.js` | Session required | N/A | none | JSON | Session gate |
| GET `/{ADMIN_PATH}/{ADMIN_PASS}/api/monitoring/range` | Internal/admin monitoring API | `admin/adminRoutes.js` | Session required | N/A | range query params | JSON | Session gate |
| GET `/{ADMIN_PATH}/{ADMIN_PASS}/api/monitoring/alerts/rules` | Internal/admin monitoring API | `admin/adminRoutes.js` | Session required | N/A | none | JSON | Session gate |
| POST `/{ADMIN_PATH}/{ADMIN_PASS}/api/monitoring/alerts/rules` | Internal/admin monitoring API | `admin/adminRoutes.js` | Session required + CSRF | form/json | alert rule payload | JSON | Session gate |
| POST `/{ADMIN_PATH}/{ADMIN_PASS}/api/monitoring/alerts/rules/:id/test` | Internal/admin monitoring API | `admin/adminRoutes.js` | Session required + CSRF | form/json | rule test payload | JSON | Session gate; snapshot generation/notification gates |
| POST `/{ADMIN_PATH}/{ADMIN_PASS}/api/monitoring/alerts/rules/:id/delete` | Internal/admin monitoring API | `admin/adminRoutes.js` | Session required + CSRF | form/json | rule id path | JSON | Session gate |
| GET `/{ADMIN_PATH}/{ADMIN_PASS}/api/monitoring/alerts/active` | Internal/admin monitoring API | `admin/adminRoutes.js` | Session required | N/A | none | JSON | Session gate |
| GET `/{ADMIN_PATH}/{ADMIN_PASS}/api/monitoring/alerts/resolved` | Internal/admin monitoring API | `admin/adminRoutes.js` | Session required | N/A | none | JSON | Session gate |
| GET `/{ADMIN_PATH}/{ADMIN_PASS}/api/monitoring/alerts/deliveries` | Internal/admin monitoring API | `admin/adminRoutes.js` | Session required | N/A | optional query filters (`rule_id`,`channel`,`status`,`limit`) | JSON | Session gate |
| POST `/{ADMIN_PATH}/{ADMIN_PASS}/api/monitoring/alerts/:ruleId/ack` | Internal/admin monitoring API | `admin/adminRoutes.js` | Session required + CSRF | form/json | optional `duration_sec` | JSON | Session gate |
| POST `/{ADMIN_PATH}/{ADMIN_PASS}/api/monitoring/alerts/:ruleId/silence` | Internal/admin monitoring API | `admin/adminRoutes.js` | Session required + CSRF | form/json | optional `duration_sec` | JSON | Session gate |


## Production invariants tied to route behavior
- `/internal/*` calls require `x-davix-bridge-token`; production additionally requires non-empty `INTERNAL_ALLOWED_IPS` (startup validation + runtime allowlist middleware).
- Static output fetch routes (`/h2i/*`, `/image/*`, `/pdf/*`, `/tools/*`) are guarded by signature checks when signed mode is enabled; production requires signed mode enabled.
- `/image/*` is the generated image output URL path.

## Evidence map used for this inventory
- Global mounts, static routes, diagnostics/internal/admin mounts: `server.js`
- External endpoint handlers: `routes/h2i-route.js`, `routes/image-route.js`, `routes/pdf-route.js`, `routes/tools-route.js`
- Internal subscription/admin-ops endpoints: `routes/subscription-route.js`
- Internal auth stack and requirements: `utils/internalAuth.js`
- API key resolution + dev/prod key-location behavior: `server.js` (`resolveApiKey`, `checkApiKey`)
- Signed URL generation/guard behavior: `utils/signedUrls.js`
- Upload/timeout/plan and endpoint gating: `utils/limits.js`, `utils/uploadLimits.js`
- Admin routes/session/CSRF and protected admin APIs: `admin/adminRoutes.js`
