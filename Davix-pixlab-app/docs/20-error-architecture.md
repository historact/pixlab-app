# PixLab Error Architecture (Exhaustive)

Scope: external (`/v1/*` + signed static output URLs), internal (`/internal/*`), diagnostics, and admin (`/${ADMIN_PATH}/${ADMIN_PASS}/*`).

This document is **code-traced** and does not rely on assumptions.

## Evidence model used in this spec

- **(A) code-enforced**: behavior hard-coded in route/middleware.
- **(B) env-configurable**: behavior exists in code but changed by env toggles/modes.
- **(C) convention**: behavior implied by style/helpers but not guaranteed by central enforcement.
- **(D) not confirmed**: could not be proven from code.

---

## 1) Canonical error envelope(s)

## 1.1 Standard JSON error envelope (`sendError`) — (A)

All `sendError(...)` calls build payload via `buildErrorPayload(...)` and then run `attachRequestId(...)`.

```json
{
  "status": "error",
  "code": "<string>",
  "message": "<string>",
  "error": {
    "code": "<string>",
    "message": "<string>",
    "hint": "<optional string>",
    "details": "<optional any, sanitized>",
    "support": {
      "email": "<optional>",
      "url": "<optional>",
      "website": "<optional>"
    }
  },
  "request_id": "<optional string>"
}
```

Key rules:
- `status`, top-level `code/message`, and nested `error.code/message` are always present in this envelope.
- `hint` only when passed.
- `details` only when passed; values are sanitized/redacted.
- `support` only for `statusCode >= 500` and only if support env vars exist.
- `request_id` is injected when `req.requestId`/`res.req.requestId` exists.

## 1.2 Request ID propagation — (A)

- A request UUID is created very early (`req.requestId = randomUUID()`) and mirrored as `Request-Id` response header.
- `attachRequestId(...)` injects `request_id` into object payloads.
- If payload already has conflicting `request_id`, it is overwritten to the current one.

Operationally: standard `sendError(...)` responses almost always include `request_id` because global middleware sets it before routes.

## 1.3 Non-standard error shapes (important differences)

1. **`GET /health` degraded response** — (A)
   - On DB failure it returns `503` + JSON:
   ```json
   { "status": "degraded", "db": "down", "error": "db_unavailable", "request_id": "..." }
   ```
   - This is not the `sendError` envelope.

2. **Admin HTML/login/CSRF failures** — (A)
   - Admin routes frequently return HTML/plain-text via `res.status(...).send(...)`.
   - Examples: login lockout 429 HTML page, invalid credentials 401 HTML page, CSRF text for non-API requests.
   - No canonical JSON error shape guaranteed for those responses.

3. **Admin router fallback error handler** — (A)
   - Returns plain text `message` with `res.status(status).send(message)` and sets `X-PixLab-Error-Source: admin-router`.

4. **Rule-test “soft error”** — (A)
   - `/api/monitoring/alerts/rules/:id/test` may return `200` with `{ ok: false, error: 'rule_not_found' }`.
   - Not sent via `sendError` and not an HTTP error status.

---

## 2) Global middleware error flow

1. `request_id` middleware sets request UUID and `Request-Id` header.
2. Idempotency parser validates optional `Idempotency-Key`/`X-Idempotency-Key`; invalid values short-circuit with `invalid_idempotency_key`.
3. CORS/body/session middleware.
4. Route-level stacks add:
   - API key auth (`checkApiKey`) for `/v1/*`.
   - Plan endpoint gating (`endpoint_not_allowed`).
   - Timeout middleware (`timeout` 503 when elapsed).
   - Upload middleware (Multer + custom mappers: `file_too_large`, etc.).
   - Daily and burst limiters (`rate_limit_exceeded`, store failures).
   - Internal auth middleware (`unauthorized`, `ip_not_allowed`, `internal_rate_limited`).
5. Route handlers issue domain errors with `sendError`.
6. Unmatched routes return `not_found` (404).
7. Final Express error middleware logs sanitized context and returns `internal_error` (500) unless headers already sent.

---

## 3) Master error code table (code | status | meaning | endpoints | evidence)

| Code | HTTP | Meaning | Endpoints that can emit | Evidence |
|---|---:|---|---|---|
| invalid_idempotency_key | 400 | Bad/missing/format-invalid idempotency header value | Any route (global middleware) | `parseIdempotencyKey` in `server.js` |
| api_key_location_not_allowed | 400 | In production, API key supplied in body/query instead of header | `/v1/*` | `checkApiKey` in `server.js` |
| invalid_api_key | 401 | Missing/invalid key or key not active yet | `/v1/*` | `checkApiKey` in `server.js` |
| key_expired | 401 | Customer key expired | `/v1/*` | `checkApiKey` in `server.js` |
| endpoint_not_allowed | 403 | Customer plan disallows endpoint | `/v1/h2i`, `/v1/image`, `/v1/pdf`, `/v1/tools` | `createEndpointGuard` in `utils/limits.js` |
| rate_limit_exceeded | 429 | Daily or burst limiter exceeded | `/v1/h2i`, `/v1/image`, `/v1/pdf`, `/v1/tools` | per-route daily limiter + `burstLimitMiddleware` |
| rate_limit_store_unavailable | 503 | Rate-limit backing store unavailable and fail-closed path used | `/v1/h2i`, `/v1/image`, `/v1/pdf`, `/v1/tools` | `rateLimitFailures.js` + route fallbacks |
| timeout | 503 | Request timed out (middleware or handler abort) | `/v1/h2i`, `/v1/image`, `/v1/pdf`, `/v1/tools` | `utils/limits.js` and route-level catch blocks |
| server_busy | 503 | Concurrency semaphore/slot unavailable | `/v1/h2i`, `/v1/image`, `/v1/pdf`, `/v1/tools` | each route’s slot acquisition failure |
| file_too_large | 413 | Per-file upload byte limit exceeded | `/v1/image`, `/v1/pdf`, `/v1/tools` | `mapMulterError` in `utils/uploadLimits.js` |
| too_many_files | 413 | File count exceeds upload limit | `/v1/image`, `/v1/pdf`, `/v1/tools` | `mapMulterError` |
| total_upload_exceeded | 413 | Total request upload bytes exceeded | `/v1/image`, `/v1/pdf`, `/v1/tools` | custom `TOTAL_UPLOAD_EXCEEDED` mapping |
| dimension_exceeded | 400 | Uploaded image dimensions exceed configured limit | `/v1/image`, `/v1/tools` | `DIMENSION_EXCEEDED` mapping |
| invalid_upload | 400 | Upload validation or unknown upload error | `/v1/image`, `/v1/pdf`, `/v1/tools` | `UNREADABLE_IMAGE` / default multer mapping |
| unsupported_media_type | 415 | Uploaded mimetype not accepted | `/v1/image`, `/v1/pdf`, `/v1/tools` | route validators + upload mapper |
| monthly_quota_exceeded | 429 | Customer monthly quota exhausted | `/v1/h2i`, `/v1/image`, `/v1/pdf`, `/v1/tools` | quota reservation checks in routes |
| invalid_parameter | 400 | Generic parameter validation failure | `/v1/h2i`, `/v1/image`, `/v1/pdf`, `/v1/tools`, many `/internal/*` routes | route-level guards |
| missing_field | 400 | Required request field missing | `/v1/h2i`, `/v1/image`, `/v1/pdf`, `/v1/tools` | route-level field checks |
| html_too_large | 413 | HTML payload exceeds MAX_HTML_CHARS | `/v1/h2i` | h2i html length check |
| render_size_exceeded | 400 | Requested render dimensions exceed size limits | `/v1/h2i` | h2i render-size guards |
| html_render_failed | 500 | Puppeteer HTML render failed | `/v1/h2i` | h2i catch block |
| image_processing_failed | 500 | Image processing pipeline failed | `/v1/image` | image route catch block |
| tool_processing_failed | 500 | Tools analysis pipeline failed | `/v1/tools` | tools route catch block |
| pdf_page_limit_exceeded | 413 | PDF page cap exceeded for action/operation | `/v1/pdf` | pdf `enforcePageLimit` |
| pdf_tool_failed | 500 | PDF processing failure | `/v1/pdf` | pdf catch block |
| unauthorized | 401/403 | Internal signed URL missing params (403) OR internal bridge auth denied (401) | signed static output URLs, `/internal/*` protected | `utils/signedUrls.js`, `utils/internalAuth.js` |
| invalid_signature | 403 | Signed URL signature invalid | static `/h2i/*`, `/img-edit/*`, `/pdf/*`, and `/tools/*` when signed-mode enabled | `signedStaticGuard` |
| expired | 403 | Signed URL expired | same signed static paths | `signedStaticGuard` |
| ip_not_allowed | 403 | Client IP not in internal allowlist | `/internal/*` with allowlist middleware | `allowlistInternalIp` / `requireAllowlistedInternalIp` |
| ip_allowlist_required | 403 | Diagnostics/internal endpoint requires allowlist but none configured | diagnostics internal endpoints | `requireAllowlistedInternalIp` |
| internal_rate_limited | 429 | Internal bridge token/IP per-window limit exceeded | `/internal/*` with `internalRateLimit` | `internalAuth.js` |
| db_unavailable | 500 | Diagnostics DB check failed (`sendError` path) | `/internal/admin/diagnostics/health` | `server.js` diagnostics route |
| diagnostics_failed | 500 | Diagnostics request-log probe failed | `/internal/admin/diagnostics/request-log` | `server.js` diagnostics route |
| snapshot_failed | 500 | Monitoring snapshot generation failed | `/internal/admin/monitoring/snapshot-view` | `server.js` snapshot route |
| missing_identifier | 400 | Required identity tuple missing | several `/internal/user/*` and key-admin routes | `routes/subscription-route.js` |
| not_found | 404 | Entity or endpoint not found | catch-all route + many internal key lookup/rotate/toggle routes | `server.js` + `subscription-route.js` |
| internal_error | 500 | Generic internal failure in specific handlers or global error middleware | `/internal/user/purge`, lookup, event processing; global fallback | `subscription-route.js` + `server.js` final handler |
| api_key_missing_needs_resync | 404 | Summary requested but no key found; advises reconcile flow | `/internal/user/summary` | `subscription-route.js` |
| user_summary_failed | 500 | Internal summary query failed | `/internal/user/summary` | `subscription-route.js` |
| plan_not_found | 400 | Referenced plan does not exist | `/internal/user/reconcile`, `/internal/subscription/event`, `/internal/admin/key/provision` | `subscription-route.js` |
| user_reconcile_failed | 500 | Reconcile operation failed | `/internal/user/reconcile` | `subscription-route.js` |
| user_logs_failed | 500 | Loading user request logs failed | `/internal/user/logs` | `subscription-route.js` |
| invalid_range | 400 | Invalid usage range argument | `/internal/user/usage` | `subscription-route.js` |
| user_usage_failed | 500 | Usage aggregation failed | `/internal/user/usage` | `subscription-route.js` |
| missing_plan | 400 | plan slug/id required for operation | `/internal/subscription/event`, `/internal/admin/key/provision` | `subscription-route.js` |
| unsupported_event | 400 | Subscription event type not supported | `/internal/subscription/event` | `subscription-route.js` |
| missing_plan_slug | 400 | Plan sync endpoint missing plan slug | `/internal/wp-sync/plan` | `subscription-route.js` |
| plan_sync_failed | 500 | Plan sync write failed | `/internal/wp-sync/plan` | `subscription-route.js` |
| plans_list_failed | 500 | Failed to list plans | `/internal/admin/plans` | `subscription-route.js` |
| keys_list_failed | 500 | Failed to list key records | `/internal/admin/keys` | `subscription-route.js` |
| keys_export_failed | 500 | Failed to export key records | `/internal/admin/keys/export` | `subscription-route.js` |
| provision_failed | 500 | Admin key provision failed | `/internal/admin/key/provision` | `subscription-route.js` |
| disable_failed | 500 | Admin key disable failed | `/internal/admin/key/disable` | `subscription-route.js` |
| rotate_failed | 500 | Admin key rotate failed | `/internal/admin/key/rotate` | `subscription-route.js` |
| user_rotate_failed | 500 | User key rotate failed | `/internal/user/key/rotate` | `subscription-route.js` |
| invalid_action | 400 | Unsupported toggle action | `/internal/user/key/toggle` | `subscription-route.js` |
| subscription_expired | 403 | Attempt to re-enable expired subscription key | `/internal/user/key/toggle` | `subscription-route.js` |
| user_toggle_failed | 500 | Toggle write failed | `/internal/user/key/toggle` | `subscription-route.js` |
| debug_error | 500 | Internal diagnostics/debug SQL failed | `/internal/subscription/debug` (only when diagnostics enabled) | `subscription-route.js` |
| csrf_session_unavailable | 500 | CSRF middleware missing session/sessionID (API requests) | admin `/api/*` calls under admin router | `utils/csrf.js` |
| csrf_secret_unavailable | 500 | CSRF secret not configured (API requests) | admin `/api/*` calls under admin router | `utils/csrf.js` |
| csrf_invalid | 403 | Invalid CSRF token on non-safe method (API requests) | admin `/api/*` POSTs | `utils/csrf.js` |
| invalid_log_channel | 404 | Unknown admin log channel | admin `/api/logs/:channel*` routes | `admin/adminRoutes.js` |
| subscription_events_clear_failed | 500 | Clearing subscription-event history failed | admin `/api/subscription-events/clear` | `admin/adminRoutes.js` |

---

## 4) Category details

## 4.1 Auth errors

- External API key auth (`checkApiKey`) emits:
  - `api_key_location_not_allowed` (prod-only body/query rejection) — (B)
  - `invalid_api_key`
  - `key_expired`
  - `internal_error` on auth subsystem failure
- Internal bridge auth middleware emits:
  - `unauthorized`
  - `ip_not_allowed`
  - `ip_allowlist_required`
  - `internal_rate_limited`
- Signed URL access guard emits:
  - `unauthorized` (missing required query params)
  - `invalid_signature`
  - `expired`

## 4.2 Validation errors

- `invalid_parameter` used heavily for malformed/invalid action params and field semantics.
- `missing_field` used for required request fields in external routes.
- `missing_identifier`, `missing_plan`, `missing_plan_slug`, `invalid_action`, `invalid_range`, `unsupported_event` used in internal/admin APIs.

## 4.3 Upload and media errors

- Global upload mapper (`utils/uploadLimits.js`) centralizes:
  - `file_too_large`, `too_many_files`, `total_upload_exceeded`
  - `dimension_exceeded`
  - `invalid_upload`
  - `unsupported_media_type`
- Additional route-level media validation also emits `unsupported_media_type` (image/pdf/tools).

## 4.4 Rate-limit / burst-limit / throttling

- Customer daily limits in each `/v1/*` endpoint emit `rate_limit_exceeded`.
- Burst limiter can emit `rate_limit_exceeded` with short-window hint.
- Store failures in rate-limit persistence can emit `rate_limit_store_unavailable` depending on fail mode (`open/closed/fallback`, env-configurable).
- Internal bridge requests have independent limiter: `internal_rate_limited`.

## 4.5 Quota errors

- Customer monthly quota reservation/finalization path emits `monthly_quota_exceeded` for `/v1/h2i`, `/v1/image`, `/v1/pdf`, `/v1/tools`.

## 4.6 Signing / URL access errors

- `signedStaticGuard()` is mounted for:
  - `/h2i/*`, `/img-edit/*`, `/pdf/*` always
  - `/tools/*` only when signed-output mode enabled
- Error codes: `unauthorized`, `invalid_signature`, `expired`.

## 4.7 Processing/runtime errors

- `timeout` from timeout middleware and explicit handler abort catches.
- `server_busy` from semaphore acquisition failure when endpoint queues are saturated.
- Domain processing failures:
  - `html_render_failed`
  - `image_processing_failed`
  - `pdf_tool_failed`
  - `snapshot_failed`
- Parameterized limits:
  - `html_too_large`, `render_size_exceeded`, `pdf_page_limit_exceeded`.

## 4.8 Internal/Admin operational errors

- Diagnostics/internal:
  - `db_unavailable`, `diagnostics_failed`, `debug_error`
- Subscription/key management:
  - `plan_not_found`, `user_reconcile_failed`, `plan_sync_failed`, `keys_list_failed`, etc.
- Admin API:
  - `invalid_log_channel`, `subscription_events_clear_failed`
- Global fallback:
  - `not_found` for unknown routes
  - `internal_error` for uncaught Express errors.

## 4.9 Diagnostics-specific / nonstandard responses

- `/health` DB failure path uses nonstandard `{"status":"degraded", ... ,"error":"db_unavailable"}`.
- Admin router errors are often plain text HTML responses, not `sendError` JSON.
- Rule test endpoint can intentionally return HTTP 200 with `{ ok: false, error: 'rule_not_found' }`.

---

## 5) Request ID, message/hint/details/support behavior matrix

| Field | Behavior |
|---|---|
| `request_id` | Added by `attachRequestId` when current request has an ID; almost always present for JSON envelopes because request-id middleware runs first. |
| `message` | Always present in standard `sendError` envelope (`message` + `error.message`). |
| `hint` | Optional; only when route passes `options.hint`. |
| `details` | Optional; only when route passes `options.details`; recursively sanitized/redacted. |
| `support` | Optional; only for HTTP `>=500`; included only when `SUPPORT_EMAIL`/`SUPPORT_URL`/`WEBSITE_URL` configured. |

---

## 6) Endpoint coverage map (where cross-cutting errors apply)

- `/v1/h2i`
  - Common: auth, endpoint gate, timeout, daily+burst rate limits
  - Domain: `html_too_large`, `render_size_exceeded`, `html_render_failed`, `monthly_quota_exceeded`, `server_busy`
- `/v1/image`
  - Common + upload mapper errors + unsupported mime + `image_processing_failed`
- `/v1/pdf`
  - Common + upload mapper/media + `pdf_page_limit_exceeded` + `pdf_tool_failed`
- `/v1/tools`
  - Common + upload mapper/media + tool validation + `tool_processing_failed`.
- `/internal/*` (subscription + diagnostics + monitoring)
  - Internal bridge auth/IP/limit middleware + route-specific errors listed above.
- Admin router (`/${ADMIN_PATH}/${ADMIN_PASS}/*`)
  - Requires session auth and CSRF middleware; JSON API routes may emit `sendError` codes, but login and many failures are HTML/plain text.

---

## 7) Troubleshooting by error code (quick guide)

- `invalid_api_key` / `key_expired`
  - Verify key location: header only in production.
  - Check key status/validity in `api_keys` and activation windows.

- `invalid_idempotency_key`
  - Use 8..128 chars, allowed charset `[A-Za-z0-9._:-]`.

- `rate_limit_exceeded`
  - Daily cap or burst cap hit. Retry after window/day; check customer plan/limits.

- `rate_limit_store_unavailable`
  - Rate-limit DB backend unavailable in fail-closed mode. Restore DB/limit store health.

- `monthly_quota_exceeded`
  - Customer monthly quota exhausted; inspect usage ledger and plan quota.

- `unsupported_media_type` / `invalid_upload` / `dimension_exceeded`
  - Confirm mime and dimensions; for tools/image use allowed image set.

- `timeout` / `server_busy`
  - Request exceeded endpoint timeout or could not get concurrency slot.
  - Reduce payload complexity/size and retry.

- `invalid_signature` / `expired` / `unauthorized` (signed URLs)
  - Ensure `exp` and `sig` query params exist and are valid; regenerate signed output URL.

- `endpoint_not_allowed`
  - Customer plan disallows endpoint (`allow_*` flag false).

- `internal_error` / `*_failed`
  - Use `request_id` + logs (`api.unhandled_error`, route-specific internal logs) to trace exact failing stage.

---

## Known Unknowns

- None for enumerated HTTP JSON error codes emitted by code paths scanned (`sendError`, upload error mapper, signed URL guard, and explicit nonstandard status payloads).
- Admin HTML/template copy can vary by render function content, but status behavior is code-confirmed.

## Evidence anchors (primary files)

- Error envelope and request-id attachment: `utils/errorResponse.js`, `utils/responseMeta.js`.
- Global request-id/idempotency/auth/not-found/unhandled flow: `server.js`.
- External endpoint errors: `routes/h2i-route.js`, `routes/image-route.js`, `routes/pdf-route.js`, `routes/tools-route.js`.
- Internal subscription/admin APIs: `routes/subscription-route.js`.
- Admin panel/API/CSRF/router errors: `admin/adminRoutes.js`, `utils/csrf.js`.
- Internal auth + rate limiting: `utils/internalAuth.js`, `utils/burstLimitMiddleware.js`, `utils/rateLimitFailures.js`.
- Upload error mapping: `utils/uploadLimits.js`.
- Signed URL errors: `utils/signedUrls.js`.
