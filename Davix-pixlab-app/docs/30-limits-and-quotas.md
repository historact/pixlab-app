# PixLab Limits / Quotas / Concurrency / Timeouts (Canonical)

This document is the single source of truth for request limits and quota behavior for:
- External endpoints: `/v1/h2i`, `/v1/image`, `/v1/pdf`, `/v1/tools`
- Internal endpoints: `/internal/*` (rate-limit middleware)

Legend:
- **(A) code-enforced**: hard logic in route/middleware.
- **(B) env-configurable**: value comes from env parsing.
- **(C) plan-configurable**: value comes from customer plan fields.
- **(D) not confirmed**: no code evidence found.

## Master matrix

| Limit name | Applies to (endpoint/action) | Default value(s) + where defined | ENV keys / plan fields | Enforcement point (file + function) | Failure error code + HTTP status | Notes (prod vs dev) |
|---|---|---|---|---|---|---|
| Endpoint allow flags | `/v1/h2i`, `/v1/image`, `/v1/pdf`, `/v1/tools` (customer keys only) | Allow unless plan flag exists and is false. (C) | Plan fields: `allow_h2i`, `allow_image`, `allow_pdf`, `allow_tools` | `utils/limits.js` → `resolveEndpointAllowance()` + `createEndpointGuard()` | `endpoint_not_allowed` (403) | Public/owner bypass this guard. |
| Request timeout (public) | All four `/v1/*` endpoints | `30_000 ms`. (A,B) | `PUBLIC_TIMEOUT_MS` | `utils/limits.js` → `resolveTimeoutMs()` + `createTimeoutMiddleware()` | `timeout` (503) | Same in prod/dev unless env override. |
| Request timeout (owner) | All four `/v1/*` endpoints | `300_000 ms`. (A,B) | `OWNER_TIMEOUT_MS` | Same as above | `timeout` (503) | Same prod/dev unless env override. |
| Request timeout (customer) | All four `/v1/*` endpoints | `300_000 ms` fallback; plan override `timeout_seconds * 1000`. (A,B,C) | Plan `timeout_seconds` | `utils/limits.js` → `resolveTimeoutMs()` | `timeout` (503) | Same prod/dev unless env/plan override. |
| Public daily limit (H2I) | `/v1/h2i` | `5` requests/day per IP. (A,B) | `PUBLIC_H2I_DAILY_LIMIT` | `routes/h2i-route.js` → `h2iDailyLimit()` | `rate_limit_exceeded` (429) | Public keys only. |
| Public daily limit (Image) | `/v1/image` | `10` files/day per IP. (A,B) | `PUBLIC_IMAGE_DAILY_LIMIT` | `routes/image-route.js` → `checkImageDailyLimit()` | `rate_limit_exceeded` (429) | Public keys only; increments by file count. |
| Public daily limit (PDF) | `/v1/pdf` | `10` files/day per IP. (A,B) | `PUBLIC_PDF_DAILY_LIMIT` | `routes/pdf-route.js` → `checkPdfDailyLimit()` | `rate_limit_exceeded` (429) | Public keys only; increments by accepted PDF file count. |
| Public daily limit (Tools) | `/v1/tools` | `10` files/day per IP. (A,B) | `PUBLIC_TOOLS_DAILY_LIMIT` | `routes/tools-route.js` → `checkToolsDailyLimit()` | `rate_limit_exceeded` (429) | Public keys only; increments by uploaded file count. |
| Customer burst limit | Customer requests on scope(s): `h2i` only by default, or all endpoints when configured | Disabled by default (`limit=0`), window default `60s`. (A,B) | `CUSTOMER_BURST_LIMIT_PER_MIN`, `CUSTOMER_BURST_WINDOW_SECONDS`, `CUSTOMER_BURST_APPLIES_TO` | `utils/burstLimitMiddleware.js` → `createCustomerBurstLimiter()`; mounted in each route | `rate_limit_exceeded` (429) | Scope defaults to `h2i`; `all` enables image/pdf/tools too. |
| Multipart per-file cap | `/v1/image`, `/v1/pdf`, `/v1/tools` uploads | `10 MB` per file when unset. (A,B) | `MAX_UPLOAD_BYTES` | `utils/uploadLimits.js` via multer `limits.fileSize` in `createUploadMiddleware()` | `file_too_large` (413) | Same prod/dev unless env override. |
| Max files/request (public, image) | `/v1/image` | `10`. (A,B) | `PUBLIC_IMAGE_MAX_FILES_PER_REQ`; global cap `GLOBAL_MAX_FILES_PER_REQ` | `utils/limits.js` → `getPublicUploadDefaults()`/`applyGlobalCeilings()`; applied in `routes/image-route.js` upload fields | `too_many_files` (413) | Global cap can only lower/equal effective max. |
| Max files/request (public, pdf) | `/v1/pdf` | `10`. (A,B) | `PUBLIC_PDF_MAX_FILES_PER_REQ`; global cap | `utils/limits.js` + `utils/uploadLimits.js` | `too_many_files` (413) | `additionalFileAllowance: 1` is added for multer to allow watermark/helper file slots in configured routes. |
| Max files/request (public, tools) | `/v1/tools` | `10`. (A,B) | `PUBLIC_TOOLS_MAX_FILES_PER_REQ`; global cap | `utils/limits.js` + `utils/uploadLimits.js` | `too_many_files` (413) | Same semantics as above. |
| Max files/request (customer) | `/v1/image`, `/v1/pdf`, `/v1/tools` | Plan `max_files_per_request`, else endpoint public default. (A,C) | Plan `max_files_per_request`; global cap | `utils/limits.js` → `resolveUploadLimits()`/`applyGlobalCeilings()` | `too_many_files` (413) | Plan fallback is endpoint public default. |
| Max files/request (owner) | `/v1/image`, `/v1/pdf`, `/v1/tools` | `50` default if `OWNER_MAX_FILES_PER_REQ` unset. (A,B) | `OWNER_MAX_FILES_PER_REQ`; global cap | `utils/limits.js` → `getOwnerUploadDefaults()`/`applyGlobalCeilings()` | `too_many_files` (413) | Owner is not unlimited for file count (default 50). |
| Total upload size/request (public image) | `/v1/image` | `10 MB`. (A,B) | `PUBLIC_IMAGE_MAX_TOTAL_UPLOAD_MB`; global cap `GLOBAL_MAX_TOTAL_UPLOAD_MB` | `utils/uploadLimits.js` disk writer (`TOTAL_UPLOAD_EXCEEDED`) | `total_upload_exceeded` (413) | Enforced while streaming upload bytes. |
| Total upload size/request (public pdf) | `/v1/pdf` | `10 MB`. (A,B) | `PUBLIC_PDF_MAX_TOTAL_UPLOAD_MB`; global cap | Same as above | `total_upload_exceeded` (413) |  |
| Total upload size/request (public tools) | `/v1/tools` | `10 MB`. (A,B) | `PUBLIC_TOOLS_MAX_TOTAL_UPLOAD_MB`; global cap | Same as above | `total_upload_exceeded` (413) |  |
| Total upload size/request (customer) | `/v1/image`, `/v1/pdf`, `/v1/tools` | Plan `max_total_upload_mb`, else endpoint public default. (A,C) | Plan `max_total_upload_mb`; global cap | `utils/limits.js` + `utils/uploadLimits.js` | `total_upload_exceeded` (413) | Global cap can only reduce/equal plan/public values. |
| Total upload size/request (owner) | `/v1/image`,`/v1/pdf`,`/v1/tools` | Unset by default (`null`) unless owner envs provided. (A,B) | `OWNER_IMAGE_MAX_TOTAL_UPLOAD_MB`, `OWNER_PDF_MAX_TOTAL_UPLOAD_MB`, `OWNER_TOOLS_MAX_TOTAL_UPLOAD_MB`; global cap | `utils/limits.js` + `utils/uploadLimits.js` | `total_upload_exceeded` (413) when effective cap exists | If both owner cap and global cap unset, total size cap is not applied. |
| Image dimension cap (public image/tools) | `/v1/image` images field; `/v1/tools` image uploads | `6000 px` max width/height. (A,B) | `PUBLIC_IMAGE_MAX_DIMENSION_PX`, `PUBLIC_TOOLS_MAX_DIMENSION_PX` | `utils/uploadLimits.js` header + metadata checks (`DIMENSION_EXCEEDED`) | `dimension_exceeded` (400) | Applies when `shouldCheckDimensions` true. |
| Image dimension cap (customer image/tools) | `/v1/image`,`/v1/tools` | Plan `max_dimension_px`, else endpoint public default. (A,C) | Plan `max_dimension_px` | `utils/limits.js` + `utils/uploadLimits.js` | `dimension_exceeded` (400) |  |
| Image dimension cap (owner image/tools) | `/v1/image`,`/v1/tools` | Unset by default (`null`) unless owner envs provided. (A,B) | `OWNER_IMAGE_MAX_DIMENSION_PX`, `OWNER_TOOLS_MAX_DIMENSION_PX` | `utils/limits.js` + `utils/uploadLimits.js` | `dimension_exceeded` (400) when effective cap exists | No global dimension ceiling exists in code. |
| H2I HTML length cap | `/v1/h2i` | `100,000` chars. (A,B) | `MAX_HTML_CHARS` | `routes/h2i-route.js` handler before render | `html_too_large` (413) | Same prod/dev unless env override. |
| H2I render width cap | `/v1/h2i` | `5,000`. (A,B) | `MAX_RENDER_WIDTH` | `routes/h2i-route.js` clamps width | none (clamp) | Values are clamped, not rejected. |
| H2I render height cap | `/v1/h2i` | `8,000`. (A,B) | `MAX_RENDER_HEIGHT` | `routes/h2i-route.js` clamps height | none (clamp) | Values are clamped, not rejected. |
| H2I render pixel-area cap | `/v1/h2i` | `20,000,000` pixels. (A,B) | `MAX_RENDER_PIXELS` | `routes/h2i-route.js` checks `width * height` | `render_too_large` (413) | Hard rejection after width/height clamp. |
| PDF page cap: to-images | `/v1/pdf` action `to-images` | prod `50`, non-prod `200`. (A,B) | `PDF_MAX_PAGES_TO_IMAGES` | `routes/pdf-route.js` → `enforcePageLimit()` | `pdf_page_limit_exceeded` (413) | Explicit NODE_ENV-based default. |
| PDF page cap: extract-images | `/v1/pdf` action `extract-images` | prod `50`, non-prod `200`. (A,B) | `PDF_MAX_PAGES_EXTRACT_IMAGES` | `routes/pdf-route.js` → `enforcePageLimit()` | `pdf_page_limit_exceeded` (413) | Explicit NODE_ENV-based default. |
| PDF page cap: split | `/v1/pdf` action `split` | `200` | `PDF_MAX_PAGES_SPLIT` | `routes/pdf-route.js` → `enforcePageLimit()` | `pdf_page_limit_exceeded` (413) | No NODE_ENV split default branch in code. |
| Concurrency semaphore (H2I) | `/v1/h2i` | prod `2`, non-prod `4`; wait `2000ms`. (A,B) | `H2I_CONCURRENCY`, `H2I_CONCURRENCY_WAIT_MS` | `routes/h2i-route.js` `acquireH2iSlot()` + `utils/semaphore.js` | `server_busy` (503) | Wait timeout returns semaphore timeout -> server_busy. |
| Concurrency semaphore (Image) | `/v1/image` | prod `4`, non-prod `6`; wait `2000ms`. (A,B) | `IMAGE_CONCURRENCY`, `IMAGE_CONCURRENCY_WAIT_MS` | `routes/image-route.js` `acquireImageSlot()` + `utils/semaphore.js` | `server_busy` (503) |  |
| Concurrency semaphore (Tools) | `/v1/tools` | prod `4`, non-prod `6`; wait `2000ms`. (A,B) | `TOOLS_CONCURRENCY`, `TOOLS_CONCURRENCY_WAIT_MS` | `routes/tools-route.js` `acquireToolsSlot()` + `utils/semaphore.js` | `server_busy` (503) | Includes `retry_after_ms` detail in response. |
| Concurrency semaphore (PDF) | `/v1/pdf` | prod `2`, non-prod `4`; wait default `15000ms`. (A,B) | `PDF_CONCURRENCY`, `PDF_CONCURRENCY_WAIT_MS` | `routes/pdf-route.js` `acquirePdfSlot()` + `utils/semaphore.js` | `server_busy` (503) | Longer default wait than other endpoints. |
| Monthly quota reserve | Customer requests on all four `/v1/*` endpoints | No hardcoded monthly default; uses key.plan `monthly_quota_files` resolved into `req.customerKey.monthly_quota`. (A,C) | Plan `monthly_quota_files` | `usage.js` `reserveQuota()` called from each route | `monthly_quota_exceeded` (429) | Reserve occurs before heavy processing. |
| Monthly quota finalize | Customer requests on all four `/v1/*` endpoints | Finalize converts reserved -> used and logs usage. (A) | N/A (uses reserved/finalized counts and request ids) | `usage.js` `finalizeQuota()` called from each route | No direct API error (internal accounting) | Duplicate idempotent finalize returns duplicate path and may release reservation. |
| Monthly quota refund | Customer request error/partial handling | Reserved units are returned (`reserved_files` decrement) on refunds/failures. (A) | N/A | `usage.js` `refundQuota()` + route-level refund attempts | No direct API error | Marks ledger status `refunded` when ledger enabled and dedupe id present. |
| Ledger reservation TTL | Quota ledger rows for reserve/finalize dedupe | `86400s` TTL for `expires_at`. (A,B) | `QUOTA_LEDGER_TTL_SECONDS`, `QUOTA_LEDGER_ENABLED` | `usage.js` `reserveQuota()` insert into `quota_ledger` | No direct API error | Controls expiry window for reclaim worker. |
| Ledger reclaim worker | Background reconciliation of stale reserves | Interval `10m`, initial delay `30s`, batch `500`. (A,B) | `QUOTA_LEDGER_RECLAIM_INTERVAL_MS`, `QUOTA_LEDGER_RECLAIM_BATCH_SIZE`, `QUOTA_LEDGER_ENABLED` | `utils/ledgerReclaim.js` + `server.js` startup | No direct API error | Expired `reserved` ledger rows become `expired`, and `usage_monthly.reserved_files` released. |
| Ledger cleanup worker | Background deletion of old ledger rows | Interval `30 days`, initial delay `60s`, retention `30 days`, batch `5000`. (A,B) | `QUOTA_LEDGER_CLEANUP_INTERVAL_DAYS`, `QUOTA_LEDGER_RETENTION_DAYS`, `QUOTA_LEDGER_CLEANUP_BATCH_SIZE`, `QUOTA_LEDGER_ENABLED` | `utils/ledgerCleanup.js` + `server.js` startup | No direct API error | Removes historical ledger rows after retention. |
| Internal API rate limit | `/internal/*` + diagnostics internal routes | `60` per `60s` per `{bridge-token,ip}` key. (A,B) | `INTERNAL_RATE_LIMIT_PER_MIN`, `INTERNAL_RATE_LIMIT_WINDOW_SECONDS` | `utils/internalAuth.js` → `internalRateLimit()` via `internalMiddleware` / `diagnosticsInternalMiddleware` | `internal_rate_limited` (429) | In-memory store; process-local, resets by window. |
| Daily/burst store outage behavior | Daily public limit + customer burst limit middleware | Production can force fail-closed semantics. (A,B) | `RATE_LIMIT_FAIL_CLOSED`, `RATE_LIMIT_DB_FAILURE_MODE` | Route daily limit functions + `utils/burstLimitMiddleware.js` | `rate_limit_store_unavailable` (503) or open/memory fallback | In production, configured `open` is forced to `closed` for public daily checks in route code. |
| GLOBAL max files ceiling | Upload endpoints `/v1/image`,`/v1/pdf`,`/v1/tools` | No default (`null`). (A,B) | `GLOBAL_MAX_FILES_PER_REQ` | `utils/limits.js` → `applyGlobalCeilings()` | indirect (`too_many_files` 413) | Overrides by taking minimum with plan/public/owner file cap (or supplies cap when base null). |
| GLOBAL total upload ceiling | Upload endpoints `/v1/image`,`/v1/pdf`,`/v1/tools` | No default (`null`). (A,B) | `GLOBAL_MAX_TOTAL_UPLOAD_MB` | `utils/limits.js` → `applyGlobalCeilings()` | indirect (`total_upload_exceeded` 413) | Overrides by minimum with plan/public/owner total upload cap (or supplies cap when base null). |

---

## Upload limits

### What is enforced

1. **Per-file size (`MAX_UPLOAD_BYTES`)** for multipart upload routes (`/v1/image`, `/v1/pdf`, `/v1/tools`) via multer `limits.fileSize`. (A,B)
2. **Per-request total bytes** tracked while streaming all files, enforced as `total_upload_exceeded`. (A,B,C)
3. **Max file count per request** via multer `limits.files`, derived from endpoint + key type + plan + global ceiling. (A,B,C)
4. **Image dimension checks** (when enabled per endpoint): fast header parse and fallback metadata read via Sharp; reject with `dimension_exceeded`. (A,B,C)

### MIME filters by endpoint

- `/v1/h2i`: JSON body (no multipart upload MIME filter path). (A)
- `/v1/image`:
  - Allowed image set defined globally: `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `image/avif`, `image/svg+xml`.
  - Validation happens in route (`validateFilesOrFail`) against primary image files. (A)
- `/v1/tools`:
  - Upload middleware `fileFilter` rejects non-allowed image mimes up-front with `unsupported_media_type` (415). (A)
- `/v1/pdf`:
  - Core PDF files are validated as `application/pdf` (route-level).
  - `watermarkImage` is discovered separately by `mimetype.startsWith('image/')` and can be used for watermark actions. (A)

### Effective upload cap resolution order

For upload endpoints, effective limits come from:
1. Base by API key type (public defaults or owner defaults),
2. customer plan overrides (`max_files_per_request`, `max_total_upload_mb`, `max_dimension_px`) for customer keys,
3. global ceilings (`GLOBAL_MAX_FILES_PER_REQ`, `GLOBAL_MAX_TOTAL_UPLOAD_MB`) as min/override.

---

## Image dimension limits

- Enforced only for endpoints that set `shouldCheckDimensions`:
  - `/v1/image`: only files in `images` field (`watermarkImage` excluded from dimension gate).
  - `/v1/tools`: every uploaded image file.
- Rejection path:
  - Code `DIMENSION_EXCEEDED` in upload module maps to API code `dimension_exceeded` (400).
- Source of numeric cap:
  - public endpoint defaults, or customer plan `max_dimension_px`, or owner env-specific cap.

---

## H2I render caps

For `/v1/h2i`:
- `MAX_HTML_CHARS` default `100000` -> `html_too_large` (413).
- Width/height are clamped to `[1..MAX_RENDER_WIDTH]` and `[1..MAX_RENDER_HEIGHT]`.
- Pixel area (`width * height`) must not exceed `MAX_RENDER_PIXELS`; otherwise `render_too_large` (413).

No plan field currently overrides these H2I render caps.

---

## PDF page/action caps

`/v1/pdf` page caps enforced before heavy action execution:
- `to-images`: `PDF_MAX_PAGES_TO_IMAGES` (default **prod 50 / non-prod 200**).
- `extract-images`: `PDF_MAX_PAGES_EXTRACT_IMAGES` (default **prod 50 / non-prod 200**).
- `split`: `PDF_MAX_PAGES_SPLIT` (default 200).

Failure is `pdf_page_limit_exceeded` (413) with details `{ pageCount, limit, action }`.

---

## Daily limits and burst limiting

### Daily public limits

Public-key requests are constrained per endpoint per UTC day using DB-backed counters (with fallback behavior):
- H2I (`scope: h2i`) increments by 1/request.
- Image (`scope: image`) increments by uploaded image file count.
- PDF (`scope: pdf`) increments by accepted PDF file count.
- Tools (`scope: tools`) increments by uploaded file count.

On overflow: `rate_limit_exceeded` (429).

### Store failure behavior

- If `RATE_LIMIT_FAIL_CLOSED=true` (or production default fail-closed), return `rate_limit_store_unavailable` (503).
- Otherwise behavior depends on `RATE_LIMIT_DB_FAILURE_MODE` (`open`, `closed`, `memory` fallback logic in route code).
- For public daily checks, production coerces configured `open` to `closed` in route code.

### Customer burst limits

Customer burst limiting uses window counters keyed by `{apiKeyId, scope}`:
- Disabled when `CUSTOMER_BURST_LIMIT_PER_MIN <= 0`.
- Over limit returns `rate_limit_exceeded` (429).
- Scope attachment:
  - `CUSTOMER_BURST_APPLIES_TO=h2i` (default) only wraps `/v1/h2i`.
  - `...=all` wraps `/v1/h2i`, `/v1/image`, `/v1/pdf`, `/v1/tools`.

---

## Monthly quotas + ledger

### Plan field to runtime quota

- `monthly_quota_files` is loaded from plans and mapped to `req.customerKey.monthly_quota` for customer keys.
- All four external routes call `reserveQuota()` for customer traffic before execution.

### Reserve / finalize / refund flow

1. **Reserve**:
   - increments `usage_monthly.reserved_files` (guarded by `used_files + reserved_files + reserve <= monthly_quota` when quota exists).
   - deny path returns `monthly_quota_exceeded` (429).
2. **Finalize**:
   - decrements `reserved_files`, increments `used_files` and endpoint counters.
   - request-log insertion and quota update are transactional when possible.
3. **Refund**:
   - decrements `reserved_files` when operation fails/aborts or finalization fallback paths require it.

### Ledger behavior (`quota_ledger`)

When `QUOTA_LEDGER_ENABLED` and dedupe id exists (`idempotency key` or request id):
- Reserve inserts `status='reserved'`, `reserve_units`, `expires_at` TTL.
- Finalize updates row to `status='finalized'` and `finalized_units`.
- Refund updates row to `status='refunded'`.
- Reclaim worker marks stale `reserved` rows as `expired` and releases `usage_monthly.reserved_files`.
- Cleanup worker deletes old ledger rows based on retention settings.

---

## Concurrency + `server_busy`

Each external endpoint has its own semaphore:
- H2I, Image, Tools, PDF each call `createSemaphore(max)` and acquire with timeout.
- On queue wait timeout, acquire rejects with `semaphore_timeout`, and route returns `server_busy` (503).
- Error payload message differs slightly by endpoint; tools includes `retry_after_ms`, PDF includes `{action}` details.

Default concurrency/wait values:
- H2I: prod 2 / non-prod 4, wait 2000ms.
- Image: prod 4 / non-prod 6, wait 2000ms.
- Tools: prod 4 / non-prod 6, wait 2000ms.
- PDF: prod 2 / non-prod 4, wait 15000ms.

---

## Timeouts + abort semantics

### Middleware timeout

`createTimeoutMiddleware(endpoint)`:
- Resolves endpoint timeout (`resolveRequestLimits`),
- Creates `AbortController` on `req`,
- On timeout: aborts signal, records timeout metric, returns `timeout` (503) if headers not sent,
- Clears timer on response `finish`/`close`/`error`.

### Route abort handling

All four external routes:
- define `createAbortError` + `assertNotAborted`,
- check `req.abortSignal` between major steps,
- attach abort listeners for cleanup (browser/page close, release semaphore, kill child process, etc.),
- convert caught `request_aborted` to API `timeout` (503).

---

## Internal / diagnostics rate limits

- `/internal/*` routes in `routes/subscription-route.js` use `...internalMiddleware`.
- Diagnostics routes in `server.js` use `...diagnosticsInternalMiddleware`.
- Both middleware stacks include `internalRateLimit()` from `utils/internalAuth.js`.
- Limit key: `x-davix-bridge-token` + client IP.
- Default: `60` requests / `60` seconds, in-memory map.
- Exceeded response: `internal_rate_limited` (429).

---

## Worked example: effective upload limits with plan + global ceilings

Assume customer key on `/v1/image` with:
- Plan: `max_files_per_request=20`, `max_total_upload_mb=80`, `max_dimension_px=8000`
- Global env: `GLOBAL_MAX_FILES_PER_REQ=12`, `GLOBAL_MAX_TOTAL_UPLOAD_MB=50`

Computation (`resolveUploadLimits` -> `applyGlobalCeilings`):
- Effective `maxFiles = min(20, 12) = 12`
- Effective `maxTotalUploadMb = min(80, 50) = 50`
- Effective `maxDimensionPx = 8000` (no global dimension ceiling exists)

Practical outcomes:
- Uploading 13 files => `too_many_files` (413)
- Uploading 10 files totaling 55MB => `total_upload_exceeded` (413)
- Uploading 1 image with width 9000 => `dimension_exceeded` (400)

(Behavior source: `utils/limits.js` and `utils/uploadLimits.js`.)

---

## Known unknowns

- **(D)** No additional global env ceiling for dimensions was found (only files + total upload have `GLOBAL_MAX_*` support).
- **(D)** No separate internal token-bucket/redis/global cross-process limiter for `/internal/*` was found; implementation is process-local `Map`.
