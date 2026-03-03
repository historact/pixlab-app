# 15) Internal API cURL Examples (`/internal/*`)

## Intro: auth, allowlist, diagnostics allowlist, and rate limiting

All `/internal/*` routes in this file are protected by internal middleware.

- **Token auth (code-enforced):** send `x-davix-bridge-token` header; it must match `SUBSCRIPTION_BRIDGE_TOKEN`, otherwise `401 unauthorized`.
- **General internal IP allowlist (env-configurable):**
  - `INTERNAL_ALLOWED_IPS` empty/unset => normal internal endpoints allow any IP.
  - `INTERNAL_ALLOWED_IPS` set => caller IP must match one entry or `403 ip_not_allowed`.
- **Diagnostics/monitoring allowlist (code-enforced + env-configurable):** endpoints wired with `diagnosticsInternalMiddleware` always require an explicit non-empty `INTERNAL_ALLOWED_IPS`; otherwise `403 ip_allowlist_required`. If set but caller IP not listed: `403 ip_not_allowed`.
- **Internal rate limiting (env-configurable):**
  - `INTERNAL_RATE_LIMIT_PER_MIN` (default `60`) and `INTERNAL_RATE_LIMIT_WINDOW_SECONDS` (default `60`).
  - Limit key = `x-davix-bridge-token` + caller IP.
  - Exceeded => `429 internal_rate_limited` with `details.limit` + `details.window_seconds`.

> Placeholders used below:
>
> ```bash
> BASE="https://api.example.com"
> BRIDGE_TOKEN="<SUBSCRIPTION_BRIDGE_TOKEN>"
> ```

## Master endpoint table

| Endpoint | Method | Purpose | Auth | Rate limit | Notes |
|---|---|---|---|---|---|
| `/internal/ping` | GET | Internal ping + DB status | Token + internal allowlist | Yes | --- |
| `/internal/user/purge` | POST | Purge API key + request/usage rows | Token + internal allowlist | Yes | Selector supports direct key IDs or identity arrays |
| `/internal/user/lookup-key-id` | POST | Resolve `api_key_id` by identity | Token + internal allowlist | Yes | Identity selector precedence is code-defined (below) |
| `/internal/user/summary` | POST | User/key/plan/usage snapshot | Token + internal allowlist | Yes | Returns reconcile hint on missing key |
| `/internal/user/reconcile` | POST | Create/update key using identity + plan | Token + internal allowlist | Yes | Accepts `valid_from`/`valid_until` + camelCase aliases |
| `/internal/user/logs` | POST | Paginated request log search | Token + internal allowlist | Yes | Paging + endpoint/status/date filters |
| `/internal/user/usage` | POST | Usage series by range | Token + internal allowlist | Yes | `hourly` / `daily` / `monthly` / `billing_period` |
| `/internal/subscription/event` | POST | Apply subscription lifecycle events | Token + internal allowlist | Yes | Activation/disable event families + idempotency by event ID |
| `/internal/wp-sync/plan` | POST | Upsert plan metadata from WP | Token + internal allowlist | Yes | `plan_slug` required |
| `/internal/admin/plans` | GET | List plans | Token + internal allowlist | Yes | --- |
| `/internal/admin/keys` | GET | Paginated key list | Token + internal allowlist | Yes | Query: `page`, `per_page`, `search` |
| `/internal/admin/keys/export` | GET | Rich key export | Token + internal allowlist | Yes | Query: `page`, `per_page`, `search`, `updated_after` |
| `/internal/admin/key/provision` | POST | Manual key provision/reactivation | Token + internal allowlist | Yes | `plan_slug` required |
| `/internal/admin/key/disable` | POST | Disable key | Token + internal allowlist | Yes | Any of subscription/email/wp user |
| `/internal/admin/key/rotate` | POST | Rotate key by subscription/email | Token + internal allowlist | Yes | Returns plaintext key once |
| `/internal/user/key/rotate` | POST | Rotate key by user identity | Token + internal allowlist | Yes | Supports wp user/email/subscription/order |
| `/internal/user/key/toggle` | POST | Enable/disable key | Token + internal allowlist | Yes | `action`: `enable` or `disable` |
| `/internal/subscription/debug` | GET | Subscription diagnostics | Token + diagnostics allowlist | Yes | Only registered when diagnostics enabled |
| `/internal/admin/diagnostics/health` | GET | DB + schema diagnostics | Token + diagnostics allowlist | Yes | Only registered when diagnostics enabled |
| `/internal/admin/diagnostics/request-log` | GET | Request log/usage diagnostics | Token + diagnostics allowlist | Yes | Only registered when diagnostics enabled |
| `/internal/admin/monitoring/metrics` | GET | Metrics snapshot JSON | Token + diagnostics allowlist | Yes | --- |
| `/internal/admin/monitoring/snapshot-view` | GET | HTML monitoring view | Token + diagnostics allowlist | Yes | Optional query `rule_id` (logged only) |
| `/internal/admin/monitoring/snapshot` | GET | Generate monitoring image snapshot | Token + diagnostics allowlist | Yes | Optional query `rule_id` |
| `/internal/admin/monitoring/snapshot-debug/ping` | GET | Snapshot debug capability ping | Token + diagnostics allowlist | Yes | --- |

---

## `GET /internal/ping`

**Parameters**: none.

```bash
curl -sS -X GET "$BASE/internal/ping" \
  -H "x-davix-bridge-token: $BRIDGE_TOKEN"
```

Success shape:

```json
{ "status": "ok", "service": "pixlab", "time_utc": "...", "auth": "ok", "db": "ok" }
```

Common errors: `unauthorized`, `ip_not_allowed`, `internal_rate_limited`.

## `POST /internal/user/purge`

Parameters (JSON body):

| Parameter | Required | Type | Accepted forms / validation |
|---|---|---|---|
| `api_key_id` | conditional | number/string | Positive numeric value. |
| `api_key_ids` | conditional | array | Must be array; at least one positive numeric value after coercion. |
| `wp_user_id` | conditional | number/string | Used as identity selector. |
| `customer_email` | conditional | string | Normalized to lowercase/trimmed for lookup. |
| `subscription_ids` | conditional | array | Identity selector list. |
| `order_ids` | conditional | array | Identity selector list. |
| `reason` | optional | string | Returned in response payload. |

At least one selector is required: direct API key id(s) OR identity fields. If neither is provided, returns `400 missing_identifier`.

```bash
curl -sS -X POST "$BASE/internal/user/purge" \
  -H "x-davix-bridge-token: $BRIDGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "api_key_ids": [123, 456],
    "reason": "gdpr_erasure"
  }'
```

Success shape:

```json
{
  "ok": true,
  "resolved_api_key_ids": [123, 456],
  "deleted": { "request_log": 10, "usage_monthly": 2, "api_keys": 2 },
  "reason": "gdpr_erasure"
}
```

Common errors: `invalid_parameter`, `missing_identifier`, `internal_error` (+ shared auth/rate-limit errors).

## `POST /internal/user/lookup-key-id`

Parameters:

| Parameter | Required | Type | Validation |
|---|---|---|---|
| `wp_user_id` | one identity required | number/string | If provided, must coerce to finite number. |
| `customer_email` | one identity required | string | Trim/lower normalize for lookup. |
| `subscription_id` | one identity required | string | Used as lookup candidate. |
| `order_id` | one identity required | string | Used as lookup candidate. |

If all missing => `400 missing_identifier`.

Identity selector precedence (code-enforced): **`wp_user_id` → `subscription_id` → `order_id` → `customer_email`**.

```bash
curl -sS -X POST "$BASE/internal/user/lookup-key-id" \
  -H "x-davix-bridge-token: $BRIDGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"wp_user_id":42}'
```

Success:

```json
{ "status": "ok", "api_key_id": 123, "identity_used": { "type": "wp_user_id", "value": 42 } }
```

Common errors: `invalid_parameter`, `missing_identifier`, `not_found`, `internal_error`.

## `POST /internal/user/summary`

Parameters: same identity fields as lookup endpoint.

```bash
curl -sS -X POST "$BASE/internal/user/summary" \
  -H "x-davix-bridge-token: $BRIDGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"customer_email":"user@example.com"}'
```

Success shape:

```json
{
  "status": "ok",
  "identity_used": { "type": "customer_email", "value": "user@example.com" },
  "user": { "customer_email": "user@example.com", "subscription_id": "sub_1", "order_id": "ord_1", "wp_user_id": 42 },
  "plan": { "plan_slug": "pro", "name": "Pro", "monthly_quota_files": 1000, "billing_period": "monthly" },
  "key": { "key_prefix": "pk_live", "key_last4": "abcd", "status": "active", "created_at": "...", "updated_at": "...", "valid_from": "...", "valid_until": "..." },
  "usage": { "period": "2026-01", "billing_window": { "start_utc": "...", "end_utc": "..." }, "total_calls": 10, "per_endpoint": { "h2i_calls": 1, "image_calls": 2, "pdf_calls": 3, "tools_calls": 4 } }
}
```

Common errors: `invalid_parameter`, `missing_identifier`, `api_key_missing_needs_resync`, `user_summary_failed`.

## `POST /internal/user/reconcile`

Parameters:

| Parameter | Required | Type | Validation |
|---|---|---|---|
| `wp_user_id` | one identity required | number/string | Finite number if provided. |
| `customer_email` | one identity required | string | normalized email. |
| `subscription_id` | one identity required | string | identity selector. |
| `order_id` | one identity required | string | identity selector. |
| `customer_name` | optional | string | forwarded to key creation helper. |
| `plan_slug` | optional* | string | used for plan resolution in helper. |
| `plan_id` | optional* | number/string | used for plan resolution in helper. |
| `subscription_status` | optional | string | forwarded to helper. |
| `valid_from` / `validFrom` | optional | ISO8601 string | invalid format => `invalid_parameter`; normalized by grace logic. |
| `valid_until` / `validUntil` | optional | ISO8601 string | invalid format => `invalid_parameter`; must be after `valid_from` when both provided. |


> *No hard route-level requirement for `plan_slug`/`plan_id`, but helper can fail with `plan_not_found`.

```bash
curl -sS -X POST "$BASE/internal/user/reconcile" \
  -H "x-davix-bridge-token: $BRIDGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "wp_user_id": 42,
    "customer_email": "user@example.com",
    "customer_name": "Example User",
    "plan_slug": "pro",
    "subscription_id": "sub_123",
    "order_id": "ord_123",
    "subscription_status": "active",
    "valid_from": "2026-01-01T00:00:00Z",
    "valid_until": "2026-02-01T00:00:00Z"
  }'
```

Success shape:

```json
{ "status": "ok", "action": "created", "key": "...", "key_prefix": "...", "key_last4": "...", "api_key_id": 123, "wp_user_id": 42 }
```

Common errors: `invalid_parameter`, `missing_identifier`, `plan_not_found`, `user_reconcile_failed`.

## `POST /internal/user/logs`

Parameters:

| Parameter | Required | Type | Validation / behavior |
|---|---|---|---|
| Identity fields (`wp_user_id`, `customer_email`, `subscription_id`, `order_id`) | one required | mixed | same identity validation as above. |
| `page` | optional | number/string | defaults 1; min 1. |
| `per_page` | optional | number/string | defaults 20; clamped to 10..100. |
| `endpoint` | optional | string | Special values `h2i`, `image`, `pdf`, `tools` map to internal LIKE patterns; others ignored as free text match map miss. |
| `status` | optional | string/number | `ok` => 2xx, `error` => >=400, numeric => exact status. |
| `from` | optional | date string | parsed by `new Date`; invalid values ignored (no filter). |
| `to` | optional | date string | parsed by `new Date`; invalid values ignored (no filter). |

```bash
curl -sS -X POST "$BASE/internal/user/logs" \
  -H "x-davix-bridge-token: $BRIDGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "wp_user_id": 42,
    "page": 1,
    "per_page": 20,
    "endpoint": "pdf",
    "status": "error",
    "from": "2026-01-01T00:00:00Z",
    "to": "2026-01-31T23:59:59Z"
  }'
```

Success shape:

```json
{ "status": "ok", "page": 1, "per_page": 20, "total": 5, "items": [ { "timestamp": "...", "endpoint": "/v1/pdf", "status": 500 } ] }
```

Common errors: `invalid_parameter`, `missing_identifier`, `user_logs_failed`.

## `POST /internal/user/usage`

Parameters:

| Parameter | Required | Type | Validation / behavior |
|---|---|---|---|
| Identity fields | one required | mixed | same identity validation as above. |
| `range` | optional | string | default `daily`; allowed `hourly`, `daily`, `monthly`, `billing_period`; else `invalid_range`. |
| `window.hours` | optional | number | used for `hourly`; clamped 1..336; default 48. |
| `window.days` | optional | number | used for `daily`; clamped 1..366; default 30. |
| `window.months` | optional | number | used for `monthly`; clamped 1..36; default 6. |

```bash
curl -sS -X POST "$BASE/internal/user/usage" \
  -H "x-davix-bridge-token: $BRIDGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"wp_user_id":42,"range":"hourly","window":{"hours":48}}'
```

Success shape:

```json
{ "status": "ok", "range": "hourly", "identity_used": {"type":"wp_user_id","value":42}, "labels": ["..."], "series": {"h2i":[0],"image":[0],"pdf":[0],"tools":[0],"total":[0]} }
```

Common errors: `invalid_parameter`, `missing_identifier`, `not_found`, `invalid_range`, `user_usage_failed`.

## `POST /internal/subscription/event`

Parameters:

| Parameter | Required | Type | Validation / behavior |
|---|---|---|---|
| `event` or `status` | yes | string | normalized to lowercase event token. Unsupported => `unsupported_event`. |
| `event_id` or `eventId` | optional | string | if missing, fallback event ID is generated from payload fields. |
| `wp_user_id` | conditional | number/string | numeric if provided, else `invalid_parameter`. |
| `customer_email` | conditional | string | normalized lowercase. |
| `subscription_id` or `external_subscription_id` | conditional | string | accepted identifier. |
| `order_id` | conditional | string/number | accepted identifier. |
| `customer_name` | optional | string | used on activation flow. |
| `plan_slug` / `plan_id` | required for activation events | string/number | missing on activation => `missing_plan`. |
| `subscription_status` | optional | string | forwarded to state-change helpers. |
| `valid_from` / `validFrom` | conditional | ISO8601 | activation validation; invalid => `invalid_parameter`. |
| `valid_until` / `validUntil` | required for non-lifetime activation | ISO8601 | invalid => `invalid_parameter`; missing for non-lifetime activation => `missing_valid_until`. |
| `pmpro_is_lifetime` / `is_lifetime` | optional | boolean | when `true`, activation does not require `valid_until`. |

Event classes:
- Activation: `activated`, `renewed`, `active`, `reactivated`
- Disable-like: `cancelled`, `canceled`, `expired`, `payment_failed`, `paused`, `disabled`

Duplicate `event_id` (DB unique conflict) is treated as ignored duplicate and returns `status: ok` with `action: ignored_duplicate` style response.

```bash
curl -sS -X POST "$BASE/internal/subscription/event" \
  -H "x-davix-bridge-token: $BRIDGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "activated",
    "event_id": "evt_123",
    "wp_user_id": 42,
    "customer_email": "user@example.com",
    "plan_slug": "pro",
    "subscription_id": "sub_123",
    "order_id": "ord_123",
    "subscription_status": "active",
    "valid_from": "2026-01-01T00:00:00Z",
    "valid_until": "2026-02-01T00:00:00Z"
  }'
```

Success shape (applied activation example):

```json
{ "status": "ok", "action": "created", "key": "...", "api_key_id": 123, "subscription_id": "sub_123", "valid_until": "..." }
```

Common errors: `missing_plan`, `missing_identifier`, `invalid_parameter`, `missing_valid_until`, `plan_not_found`, `unsupported_event`, `internal_error`.

## `POST /internal/wp-sync/plan`

Parameters:

| Parameter | Required | Type |
|---|---|---|
| `plan_slug` | required | string |
| `name` | optional | string |
| `billing_period` | optional | enum (`monthly`,`yearly`) |
| `monthly_quota_files` | optional | number |
| `max_files_per_request` | optional | number |
| `max_total_upload_mb` | optional | number |
| `max_dimension_px` | optional | number |
| `timeout_seconds` | optional | number |
| `allow_h2i` | optional | number/bool-like |
| `allow_image` | optional | number/bool-like |
| `allow_pdf` | optional | number/bool-like |
| `allow_tools` | optional | number/bool-like |
| `is_free` | optional | number/bool-like |
| `description` | optional | string |
| `timeout_ms` | optional | number |
| `max_upload_bytes_per_file` | optional | number |
| `h2i_enabled` | optional | number/bool-like |
| `h2i_max_html_chars` | optional | number |
| `h2i_max_render_width` | optional | number |
| `h2i_max_render_height` | optional | number |
| `h2i_max_render_pixels` | optional | number |
| `image_enabled` | optional | number/bool-like |
| `image_max_dimension_px` | optional | number |
| `image_max_total_upload_mb` | optional | number |
| `image_max_files_per_request` | optional | number |
| `pdf_enabled` | optional | number/bool-like |
| `pdf_max_total_upload_mb` | optional | number |
| `pdf_max_files_per_request` | optional | number |
| `pdf_max_pages_to_images` | optional | number |
| `pdf_max_pages_extract_images` | optional | number |
| `pdf_max_pages_split` | optional | number |
| `tools_enabled` | optional | number/bool-like |
| `tools_max_dimension_px` | optional | number |
| `tools_max_total_upload_mb` | optional | number |
| `tools_max_files_per_request` | optional | number |
| `quota_mode` | optional | enum (`monthly_total_only`,`monthly_scoped_only`,`monthly_both`) |
| `monthly_h2i_limit` | optional | number |
| `monthly_image_limit` | optional | number |
| `monthly_pdf_limit` | optional | number |
| `monthly_tools_limit` | optional | number |
| `burst_limit_per_min` | optional | number |
| `burst_window_seconds` | optional | number |
| `burst_applies_to` | optional | enum (`h2i`,`all`) |

`plan_slug` must be non-empty trimmed text, else `400 missing_plan_slug`.

```bash
curl -sS -X POST "$BASE/internal/wp-sync/plan" \
  -H "x-davix-bridge-token: $BRIDGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "plan_slug":"pro",
    "name":"Pro",
    "billing_period":"monthly",
    "monthly_quota_files":1000,
    "max_files_per_request":20,
    "max_total_upload_mb":100,
    "max_dimension_px":8000,
    "timeout_seconds":120,
    "allow_h2i":1,
    "allow_image":1,
    "allow_pdf":1,
    "allow_tools":1,
    "is_free":0,
    "description":"Pro plan",
    "timeout_ms":120000,
    "max_upload_bytes_per_file":10485760,
    "h2i_enabled":true,
    "h2i_max_html_chars":500000,
    "h2i_max_render_width":4096,
    "h2i_max_render_height":4096,
    "h2i_max_render_pixels":16777216,
    "image_enabled":"1",
    "image_max_dimension_px":9000,
    "image_max_total_upload_mb":200,
    "image_max_files_per_request":30,
    "pdf_enabled":1,
    "pdf_max_total_upload_mb":300,
    "pdf_max_files_per_request":50,
    "pdf_max_pages_to_images":100,
    "pdf_max_pages_extract_images":100,
    "pdf_max_pages_split":200,
    "tools_enabled":1,
    "tools_max_dimension_px":9000,
    "tools_max_total_upload_mb":250,
    "tools_max_files_per_request":40,
    "quota_mode":"monthly_both",
    "monthly_h2i_limit":500,
    "monthly_image_limit":500,
    "monthly_pdf_limit":500,
    "monthly_tools_limit":500,
    "burst_limit_per_min":120,
    "burst_window_seconds":60,
    "burst_applies_to":"all"
  }'
```

Success:

```json
{ "status": "ok", "action": "upserted", "plan_slug": "pro" }
```

Common errors: `missing_plan_slug`, `plan_sync_failed`.

## `GET /internal/admin/plans`

Parameters: none.

```bash
curl -sS -X GET "$BASE/internal/admin/plans" -H "x-davix-bridge-token: $BRIDGE_TOKEN"
```

Success: `{ "status":"ok", "items":[...] }`

Common errors: `plans_list_failed` (+ shared auth/rate-limit errors).

## `GET /internal/admin/keys`

Query params:

| Query | Required | Type | Validation |
|---|---|---|---|
| `page` | optional | number | default 1; min 1. |
| `per_page` | optional | number | default 20; clamped 1..100. |
| `search` | optional | string | substring match against email/subscription/key prefix. |

```bash
curl -sS -G "$BASE/internal/admin/keys" \
  -H "x-davix-bridge-token: $BRIDGE_TOKEN" \
  --data-urlencode "page=1" \
  --data-urlencode "per_page=20" \
  --data-urlencode "search=user@example.com"
```

Success shape: `{ "status":"ok", "items":[...], "total": 10, "page": 1, "per_page": 20 }`

Common errors: `keys_list_failed`.

## `GET /internal/admin/keys/export`

Query params:

| Query | Required | Type | Validation |
|---|---|---|---|
| `page` | optional | number | default 1; min 1. |
| `per_page` | optional | number | default 200; clamped 1..500. |
| `search` | optional | string | same search behavior as `/keys`. |
| `updated_after` | optional | ISO8601 string | invalid => `invalid_parameter`. |

```bash
curl -sS -G "$BASE/internal/admin/keys/export" \
  -H "x-davix-bridge-token: $BRIDGE_TOKEN" \
  --data-urlencode "page=1" \
  --data-urlencode "per_page=200" \
  --data-urlencode "updated_after=2026-01-01T00:00:00Z"
```

Success shape:

```json
{ "status":"ok", "page":1, "per_page":200, "total":2000, "total_pages":10, "items":[{"api_key_id":123,"plan":{"plan_slug":"pro"}}] }
```

Common errors: `invalid_parameter`, `keys_export_failed`.

## `POST /internal/admin/key/provision`

Parameters:

| Parameter | Required | Type | Validation |
|---|---|---|---|
| `plan_slug` | required | string | required else `missing_plan`. |
| `customer_email` | optional | string | forwarded to provisioning helper. |
| `subscription_id` | optional | string | forwarded. |
| `order_id` | optional | string | forwarded. |
| `wp_user_id` | optional | number/string | must be numeric if provided. |
| `reactivated` | optional | bool/string/number | true/`"true"`/1/`"1"` enables reactivation branch. |
| `valid_from` / `validFrom` | optional | ISO8601 | parsed by admin validity parser. |
| `valid_until` / `validUntil` | optional | ISO8601 | must be after `valid_from` when both provided. |

```bash
curl -sS -X POST "$BASE/internal/admin/key/provision" \
  -H "x-davix-bridge-token: $BRIDGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"plan_slug":"pro","customer_email":"user@example.com","subscription_id":"sub_123","reactivated":true}'
```

Success shape: `{ "status":"ok", "action":"created", "key":"...", "key_prefix":"...", "key_last4":"...", "plan_id":2 }`

Common errors: `missing_plan`, `invalid_parameter`, `plan_not_found`, `provision_failed`.

## `POST /internal/admin/key/disable`

Parameters:

| Parameter | Required | Type | Validation |
|---|---|---|---|
| `subscription_id` | one required | string | |
| `customer_email` | one required | string | |
| `wp_user_id` | one required | number/string | must be numeric if provided. |

```bash
curl -sS -X POST "$BASE/internal/admin/key/disable" \
  -H "x-davix-bridge-token: $BRIDGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"wp_user_id":42}'
```

Success: `{ "status":"ok", "action":"disabled", "affected": 1 }`

Common errors: `missing_identifier`, `invalid_parameter`, `disable_failed`.

## `POST /internal/admin/key/rotate`

Parameters:

| Parameter | Required | Type |
|---|---|---|
| `subscription_id` | one required | string |
| `customer_email` | one required | string |

```bash
curl -sS -X POST "$BASE/internal/admin/key/rotate" \
  -H "x-davix-bridge-token: $BRIDGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"subscription_id":"sub_123"}'
```

Success: `{ "status":"ok", "action":"rotated", "key":"...", "key_prefix":"...", "key_last4":"..." }`

Common errors: `missing_identifier`, `not_found`, `rotate_failed`.

## `POST /internal/user/key/rotate`

Parameters:

| Parameter | Required | Type | Validation |
|---|---|---|---|
| `wp_user_id` | one identity required | number/string | must be numeric if provided. |
| `customer_email` | one identity required | string | |
| `subscription_id` | one identity required | string | |
| `order_id` | one identity required | string | |

```bash
curl -sS -X POST "$BASE/internal/user/key/rotate" \
  -H "x-davix-bridge-token: $BRIDGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"order_id":"ord_123"}'
```

Success: `{ "status":"ok", "action":"rotated", "identity_used":{"type":"order_id","value":"ord_123"}, "key":"..." }`

Common errors: `missing_identifier`, `invalid_parameter`, `not_found`, `user_rotate_failed`.

## `POST /internal/user/key/toggle`

Parameters:

| Parameter | Required | Type | Validation |
|---|---|---|---|
| `action` | required | string | must be `enable` or `disable`, else `invalid_action`. |
| `wp_user_id` | one identity required | number/string | numeric if provided. |
| `customer_email` | one identity required | string | |
| `subscription_id` | one identity required | string | |
| `order_id` | one identity required | string | |

```bash
curl -sS -X POST "$BASE/internal/user/key/toggle" \
  -H "x-davix-bridge-token: $BRIDGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"wp_user_id":42,"action":"disable"}'
```

Success: `{ "status":"ok", "action":"disable", "identity_used":{"type":"wp_user_id","value":42}, "new_status":"disabled" }`

Common errors: `missing_identifier`, `invalid_parameter`, `invalid_action`, `not_found`, `subscription_expired`, `user_toggle_failed`.

## Diagnostics-only endpoints (registered only when diagnostics are enabled)

### `GET /internal/subscription/debug`
Parameters: none.

```bash
curl -sS -X GET "$BASE/internal/subscription/debug" -H "x-davix-bridge-token: $BRIDGE_TOKEN"
```

Success: `{ "status":"ok", "debug":{"tokenConfigured":true,"dbConnected":true,"plans":["free","pro"]} }`

Errors: `ip_allowlist_required`, `ip_not_allowed`, `unauthorized`, `internal_rate_limited`, `debug_error`.

### `GET /internal/admin/diagnostics/health`
Parameters: none.

```bash
curl -sS -X GET "$BASE/internal/admin/diagnostics/health" -H "x-davix-bridge-token: $BRIDGE_TOKEN"
```

Success: `{ "status":"ok", "db":"up", "db_schema_ok":true, "missing_columns":[], "missing_indexes":[] }`

Errors: `ip_allowlist_required`, `ip_not_allowed`, `unauthorized`, `internal_rate_limited`, `db_unavailable`.

### `GET /internal/admin/diagnostics/request-log`
Parameters: none.

```bash
curl -sS -X GET "$BASE/internal/admin/diagnostics/request-log" -H "x-davix-bridge-token: $BRIDGE_TOKEN"
```

Success shape includes `db_time`, `request_log_exists`, `request_log_columns`, `usage_monthly_exists`, `usage_monthly_columns`, `sample_insert_test`.

Errors: `ip_allowlist_required`, `ip_not_allowed`, `unauthorized`, `internal_rate_limited`, `diagnostics_failed`.

## Monitoring internal endpoints (diagnostics allowlist middleware)

### `GET /internal/admin/monitoring/metrics`
Parameters: none.

```bash
curl -sS -X GET "$BASE/internal/admin/monitoring/metrics" -H "x-davix-bridge-token: $BRIDGE_TOKEN"
```

Success: metrics snapshot JSON from monitoring collector.

Errors: `ip_allowlist_required`, `ip_not_allowed`, `unauthorized`, `internal_rate_limited`.

### `GET /internal/admin/monitoring/snapshot-view`
Query params:

| Query | Required | Type | Notes |
|---|---|---|---|
| `rule_id` | optional | number/string | Parsed to number for logging; not used to query rule in this endpoint. |

```bash
curl -sS -G "$BASE/internal/admin/monitoring/snapshot-view" \
  -H "x-davix-bridge-token: $BRIDGE_TOKEN" \
  --data-urlencode "rule_id=12"
```

Success: HTML response (`text/html`) containing snapshot dashboard view.

Errors: `ip_allowlist_required`, `ip_not_allowed`, `unauthorized`, `internal_rate_limited`.

### `GET /internal/admin/monitoring/snapshot`
Query params:

| Query | Required | Type | Validation |
|---|---|---|---|
| `rule_id` | optional | number/string | parsed with `Number(...)`; invalid/empty falls back to `0` => `manual` rule token for snapshot generation. |

```bash
curl -sS -G "$BASE/internal/admin/monitoring/snapshot" \
  -H "x-davix-bridge-token: $BRIDGE_TOKEN" \
  --data-urlencode "rule_id=12" \
  --output snapshot.png
```

Success: binary image body (`image/png` unless generator overrides type).

Errors: `ip_allowlist_required`, `ip_not_allowed`, `unauthorized`, `internal_rate_limited`, `snapshot_failed`.

### `GET /internal/admin/monitoring/snapshot-debug/ping`
Parameters: none.

```bash
curl -sS -X GET "$BASE/internal/admin/monitoring/snapshot-debug/ping" \
  -H "x-davix-bridge-token: $BRIDGE_TOKEN"
```

Success:

```json
{ "ok": true, "snapshot_debug_enabled": false, "time": "...", "node": "v20.x", "has_puppeteer": true, "puppeteer_version": "..." }
```

Errors: `ip_allowlist_required`, `ip_not_allowed`, `unauthorized`, `internal_rate_limited`.

## Coverage (files and patterns scanned)

- `routes/subscription-route.js` (`app.get('/internal...`, `app.post('/internal...`)
- `server.js` (`/internal/admin/diagnostics/*`, `/internal/admin/monitoring/*`)
- `utils/internalAuth.js` (token/authz/allowlist/rate-limit behavior)
- Search pattern used: `rg -n "app\.(get|post)\('/internal" routes/subscription-route.js server.js`
