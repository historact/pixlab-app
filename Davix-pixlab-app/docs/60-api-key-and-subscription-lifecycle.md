# 60 - API Key & Subscription Lifecycle (Code-Evidenced SSOT)

This document covers PixLab API key classes, customer-key lifecycle, subscription event ingestion, plan assignment, rotation, purge/reconcile/lookup flows, and security controls.

> Evidence convention in this doc:
> - **(A) code-enforced**: directly enforced by code paths.
> - **(B) env-configurable**: behavior switches by env.
> - **(C) convention**: implied workflow, not hard-validated everywhere.
> - **(D) not confirmed**: cannot be proven from current repository code.

---

## 1) Key Types

## 1.1 Owner/static keys (`API_KEYS`) and public keys (`PUBLIC_API_KEYS`)

| Key class | Source | Matching logic | Request classification | Notes |
|---|---|---|---|---|
| Owner/static | `API_KEYS` env, parsed by `parseKeyList` in `server.js` | Exact string match against `allowedKeys.includes(key)` | `req.apiKeyType = 'owner'` unless key is also in `PUBLIC_API_KEYS` | (A/B) |
| Public | `PUBLIC_API_KEYS` env, parsed into `publicKeySet` | Exact match after allowlist match | `req.apiKeyType = 'public'` | Must also be present in `API_KEYS` to pass allowlist check. (A/B) |
| Customer | `api_keys` table (`key_prefix + key_hash`) | Prefix lookup + hash verify in `findCustomerKeyByPlaintext` | `req.apiKeyType = 'customer'` and `req.customerKey` payload attached | Includes validity-window and status checks. (A) |

Evidence:
- `server.js` key parsing/classification: `allowedKeys`, `publicKeySet`, `checkApiKey()`. (A/B)
- `utils/customerKeys.js` `findCustomerKeyByPlaintext()` query and verification pipeline. (A)
- `utils/validateEnv.js` requires `API_KEYS` in production. (B)

## 1.2 API key location rules (production restriction)

| Environment | Accepted locations | Rejected locations | Behavior |
|---|---|---|---|
| Production | `X-Api-Key` header OR `Authorization: Bearer <key>` | `api_key` body and `?key` query | 400 `api_key_location_not_allowed` if body/query key present. (A/B) |
| Non-production | Header + Bearer + `api_key` body + `?key` query | N/A | Dev fallback accepted. (A/B) |

Evidence:
- `server.js`: `resolveApiKey()`, `checkApiKey()` location validation + error response.

---

## 2) Customer Key Lifecycle

## 2.1 Provision / activate

Primary creation/update path:
- `/internal/user/reconcile` -> `ensureApiKeyForWpUser()` -> `activateOrProvisionKey()`.
- `/internal/subscription/event` activation events -> `activateOrProvisionKey()`.
- `/internal/admin/key/provision` -> `activateOrProvisionKey()`.

### 2.1.1 Identity resolution order (existing key lookup)
`findExistingKey()` uses this first-match order:
1. `wp_user_id`
2. `customer_email` (lowercased)
3. `subscription_id`
4. `order_id`

(A) code-enforced.

### 2.1.2 Plan resolution logic (inside provisioning)
`activateOrProvisionKey()` resolves plan in this order:
1. Explicit input (`planId`/`planSlug`) -> `resolvePlanId()`; throws `PLAN_NOT_FOUND` if slug missing in DB.
2. Existing key `plan_id`.
3. If `allowPlanFallback=true` (reconcile flow), load `free` plan.
4. If creating a new key and still unresolved -> throw `PLAN_NOT_FOUND`.

(A) code-enforced.

### 2.1.3 Validity-window normalization
`activateOrProvisionKey()` rules:
- `valid_from`:
  - Existing key + provided `valid_from`: normalize with grace-window logic (`normalizeManualValidFrom`).
  - Existing key + not provided: preserve existing `valid_from`.
  - New key: defaults to immediate (grace-adjusted) unless explicitly provided.
- `valid_until`:
  - Lifetime (`isLifetime=true`): force `NULL`.
  - Provided `valid_until`: use provided value.
  - Existing key + not provided: preserve existing.
  - New key + not provided: `NULL`.
- Ordering validation (`valid_until > valid_from`) only executes when **both** `valid_from` and `valid_until` are provided on non-lifetime updates.

(A) code-enforced.

### 2.1.4 Status behavior during activation
- New key inserts with `status='active'`.
- Existing key update forces `status='active'`.
- Sticky subscription statuses (`cancelled`, `expired`) are preserved on update unless `allowStatusReactivate=true`.

(A) code-enforced.

## 2.2 Disable / enable / status transitions

### 2.2.1 Disable transitions
Disable can be triggered by:
- `/internal/admin/key/disable` -> `disableCustomerKey()` sets `status='disabled'` and `license_key=NULL`.
- `/internal/subscription/event` disable events -> `applySubscriptionStateChange()`; may disable based on event type/validity.
- `/internal/user/key/toggle` with `action=disable` -> direct status update.
- Runtime auth self-heal on expired customer key in `checkApiKey()`: sets `status='disabled'`, `subscription_status='expired'`.

(A) code-enforced.

### 2.2.2 Enable transitions
- `/internal/user/key/toggle` with `action=enable` only succeeds if:
  - key exists, and
  - `valid_until` is not in the past, and
  - `subscription_status` is not `'expired'`.
- Otherwise 403 `subscription_expired`.

(A) code-enforced.

## 2.3 Expiry watcher behavior

`startExpiryWatcher()` (if enabled) schedules periodic `runExpiryWatcherOnce()`:
1. Acquire MySQL lock `pixlab_api_keys_expiry`.
2. Batch-update active-but-expired keys:
   - `status='active'` AND `valid_until < NOW()` -> set `status='disabled'`, `subscription_status='expired'`.
3. Batch-delete keys already in terminal expired state:
   - `subscription_status='expired'` AND `status='disabled'` -> `DELETE`.
4. Release lock.

(A/B) code-enforced and interval/batch are env-configurable (`API_KEYS_EXPIRY_WATCHER_*`).

## 2.4 Deletion rules

### 2.4.1 Explicit purge endpoint (`/internal/user/purge`)
Deletion transaction order:
1. `DELETE request_log WHERE api_key_id IN (...)`
2. `DELETE usage_monthly WHERE api_key_id IN (...)`
3. `DELETE api_keys WHERE id IN (...)`

Can target by explicit `api_key_id(s)` OR by resolved identity selectors (`wp_user_id`, `customer_email`, `subscription_ids`, `order_ids`).

(A) code-enforced.

### 2.4.2 Automatic terminal deletion
Expired watcher deletes rows only when both `subscription_status='expired'` and `status='disabled'`.

(A) code-enforced.

---

## 3) Subscription Event Ingestion (`POST /internal/subscription/event`)

## 3.1 Supported normalized events

### Activation set
- `activated`
- `renewed`
- `active`
- `reactivated`

### Disable set
- `cancelled`
- `canceled`
- `expired`
- `payment_failed`
- `paused`
- `disabled`

Anything else -> 400 `unsupported_event`.

(A) code-enforced (`activationEvents`, `disableEvents`).

## 3.2 Event ID normalization and dedupe

`eventId` derivation:
1. Use explicit `event_id` or `eventId` if present/non-empty.
2. Else compute SHA-256 fallback id from normalized tuple:
   `event, subscription_id, order_id, wp_user_id, customer_email, planKey(plan_slug|plan_id), valid_from, valid_until, subscription_status`.

Insert path:
- always attempts `insertSubscriptionEvent(... decision='RECEIVED')` first.
- DB has unique key on `subscription_events.event_id`; duplicate insert raises `ER_DUP_ENTRY`.
- duplicate branch updates decision to `IGNORED_DUPLICATE` and returns ignored response shape.

(A) code-enforced.

## 3.3 Decision outcomes (decision table extracted from code)

| Decision | When set | Notes |
|---|---|---|
| `RECEIVED` | Immediately on insert attempt | Initial state persisted in `subscription_events`. |
| `IGNORED_DUPLICATE` | `ER_DUP_ENTRY` on `event_id` insert | Returns `ignored_duplicate` action payload. |
| `FAILED_VALIDATION` | Validation failures (missing plan/identifier, invalid dates, missing non-lifetime `valid_until`, unsupported event) | Set before returning 4xx when insert succeeded. |
| `IGNORED_OLDER` | Incoming validity window older than existing key state for activation/disable paths | Returns `ignored_older` action payload. |
| `APPLIED` | Activation/disable operation applied successfully | Stores `api_key_id` if available. |
| `FAILED_INTERNAL` | Catch-all exception during apply phase | Error returned as 400/500 depending on code mapping. |

(A) code-enforced via `recordDecision()` calls in `/internal/subscription/event` handler.

## 3.4 Mapping from event processing to DB writes

| Phase | Writes |
|---|---|
| Ingestion start | `INSERT subscription_events (... decision='RECEIVED', payload_json conditional by settings)` |
| Decision updates | `UPDATE subscription_events SET decision=?, api_key_id=?, error_message=? WHERE event_id=?` |
| Activation apply | `INSERT/UPDATE api_keys` through `activateOrProvisionKey()` |
| Disable apply | `UPDATE api_keys` through `applySubscriptionStateChange()` |
| Duplicate | no `api_keys` mutation in duplicate branch; decision update only |

(A) code-enforced.

## 3.5 Activation validation and ignore-older rules

For activation events:
- Requires plan (`plan_slug` or `plan_id`).
- Requires at least one identity (`wp_user_id` / email / subscription / order).
- `valid_from` and `valid_until` must parse if provided.
- Non-lifetime activation requires `valid_until` to be provided.
- If key exists and incoming `valid_until` < existing `valid_until`, event is `IGNORED_OLDER`.

(A) code-enforced.

## 3.6 Disable validation and ignore-older rules

For disable events:
- Requires at least one identity.
- `valid_until` must parse if provided.
- If incoming `valid_until` is older than existing key `valid_until`, event is `IGNORED_OLDER`.
- For hard-disable event types (`expired`, `disabled`), if current key window is still ahead of now and incoming window is absent/older, event is `IGNORED_OLDER`.

(A) code-enforced.

---

## 4) Plan Assignment Rules and Endpoint Effects

## 4.1 Plan lookup + fallback behavior

### During customer authentication
`findCustomerKeyByPlaintext()` plan loading order:
1. Join by `api_keys.plan_id`.
2. If no join and `rec.plan_slug`, query by slug.
3. If still missing, load `free` plan and self-heal `api_keys.plan_id` to that free plan ID.

(A) code-enforced.

### During internal summary endpoint
`findPlanRow()` order:
1. by `plan_id`
2. by `plan_slug`
3. cached `free` plan fallback

(A) code-enforced.

### `plan_id` nullable semantics
- Schema migration forces `api_keys.plan_id` nullable and FK with `ON DELETE SET NULL`.
- If referenced plan row is deleted, `plan_id` can become null; runtime auth can still fallback to free plan (if present).

(A) code-enforced by DB constraint + lookup logic.

## 4.2 How `allow_*` and quota fields affect external endpoints

`createEndpointGuard(endpoint)` uses resolved plan flags for customer keys:
- Endpoint flag map:
  - h2i -> `allow_h2i`
  - image -> `allow_image`
  - pdf -> `allow_pdf`
  - tools -> `allow_tools`
- If customer key and flag explicitly false -> 403 `endpoint_not_allowed`.
- If flag null/undefined -> treated as allowed.

Upload/timeout shaping for customer keys (`resolveUploadLimits` + `resolveTimeoutMs`):
- `max_files_per_request`
- `max_total_upload_mb`
- `max_dimension_px`
- `timeout_seconds`

Quota enforcement (customer keys) in route handlers:
- `reserveQuota()` with `monthlyQuota = req.customerKey.monthly_quota`
- if reserve denied -> 429 `monthly_quota_exceeded`
- later `finalizeQuota()` / `refundQuota()` adjust usage.

(A) code-enforced.

---

## 5) Key Rotation Rules

## 5.1 Admin rotate (`POST /internal/admin/key/rotate`)

Identifier requirement:
- requires `subscription_id` OR `customer_email`.

Flow:
1. Begin transaction.
2. Find latest key row by identifier.
3. Generate new key (`generateApiKey()` returns plaintext + prefix + hash).
4. Update row fields: `key_prefix`, `key_hash`, `key_last4`, `rotated_at=NOW()`, `updated_at=NOW()`, `license_key=NULL`.
5. Return plaintext key once in response.

(A) code-enforced.

## 5.2 User rotate (`POST /internal/user/key/rotate`)

Identifier requirement:
- one of `wp_user_id`, `subscription_id`, `customer_email`, `order_id`.

Flow:
1. Resolve key by multi-identifier resolver.
2. Generate new key.
3. Update row fields: `key_prefix`, `key_hash`, `key_last4`, `updated_at=NOW()`, `license_key=NULL`; include `rotated_at=NOW()` only if column exists.
4. Return plaintext key once.

(A) code-enforced.

## 5.3 Old key hash handling

Old key hash is **overwritten** in-place (`UPDATE api_keys SET key_hash=? ... WHERE id=?`).
There is no historical hash table or explicit revoke list in this code path.

(A) code-enforced (overwrite behavior),
(D) not confirmed for any external revocation/audit system outside this repo.

---

## 6) Purge / Reconcile / Lookup Flows

## 6.1 Required identifiers by endpoint

| Endpoint | Required selectors |
|---|---|
| `/internal/user/lookup-key-id` | any one of `wp_user_id`, `customer_email`, `subscription_id`, `order_id` |
| `/internal/user/summary` | same as above |
| `/internal/user/reconcile` | same as above |
| `/internal/user/key/rotate` | same as above |
| `/internal/user/key/toggle` | same as above + `action` (`enable`/`disable`) |
| `/internal/user/purge` | either `api_key_id` / `api_key_ids`, OR identity selectors (`wp_user_id`, `customer_email`, `subscription_ids`, `order_ids`) |

(A) code-enforced.

## 6.2 Identity resolution precedence (`resolveKeyFromIdentifiers`)

Search order and behavior:
1. `wp_user_id` (if column exists)
2. `subscription_id` OR `wp_subscription_id` predicates
3. `order_id` OR `wp_order_id` predicates
4. `LOWER(customer_email)`

Returns first match ordered by `updated_at DESC` for each search block.

(A) code-enforced.

## 6.3 Reconcile behavior summary

`/internal/user/reconcile` calls `ensureApiKeyForWpUser()` with `allowPlanFallback=true` and `allowStatusReactivate=false`:
- creates key if absent,
- updates key if present,
- may use free-plan fallback when no plan input and no existing plan,
- preserves sticky cancelled/expired subscription statuses by default.

(A) code-enforced.

---

## 7) Security Notes

## 7.1 Hash algorithm selection for customer keys

`hashApiKey()` selection order:
1. `argon2` available -> Argon2id
2. else `bcrypt` available -> bcrypt rounds=12
3. else fallback -> `scrypt$<salt>$<hash>` format

Verification supports:
- `$argon2...`
- `$2...` (bcrypt)
- `scrypt$...` with timing-safe compare.

(A) code-enforced.

## 7.2 Timing-safe comparisons

- Internal bridge token compare uses `crypto.timingSafeEqual` (length-checked).
- Signed URL signature compare uses `crypto.timingSafeEqual`.
- Scrypt hash verification uses `crypto.timingSafeEqual`.

(A) code-enforced.

## 7.3 Secret handling and legacy plaintext clearing

- Customer keys are generated plaintext once; stored as hash + prefix + last4.
- Rotation and disable/provision paths repeatedly set `license_key=NULL` (legacy plaintext field cleanup).
- `license_key` column is marked deprecated in migration comments.

(A) code-enforced.

## 7.4 Production restrictions on key location

Production rejects body/query API key transport (`api_key` / `?key`) and accepts header/Bearer only.

(A/B) code-enforced and environment-dependent (`isProduction()`).

---

## 8) ASCII Sequence Diagrams

## 8.1 External customer request -> auth -> quota -> output URL

```text
Client
  | POST /v1/h2i (X-Api-Key)
  v
checkApiKey (server.js)
  | resolveApiKey(header/bearer[/dev body/query])
  | allowedKeys? else findCustomerKeyByPlaintext()
  | validity/status/hash checks
  v
Route middleware (/v1/*)
  | createEndpointGuard(endpoint) -> allow_* flag gate
  | timeout middleware
  v
Endpoint handler (h2i/image/pdf/tools)
  | if customer: reserveQuota(monthly_quota)
  | process request, produce file
  | buildSignedUrl(baseUrl, /<endpoint>/<file>)
  | finalizeQuota() or refundQuota()
  v
Response JSON { url }
```

## 8.2 Subscription event -> reconcile -> key update/provision

```text
Bridge
  | POST /internal/subscription/event
  v
internalMiddleware
  | token/IP/rate checks
  v
event handler
  | normalize event + eventId (explicit or fallback hash)
  | INSERT subscription_events(decision=RECEIVED)
  | duplicate? -> decision=IGNORED_DUPLICATE -> return ignored_*
  | validate plan/identity/validity
  | older-than-existing? -> decision=IGNORED_OLDER -> return ignored_*
  | activation -> activateOrProvisionKey()
  | disable    -> applySubscriptionStateChange()
  | decision=APPLIED
  v
Response (created/updated/disabled/not_found/etc)
```

## 8.3 Rotation

```text
Caller
  | POST /internal/admin/key/rotate OR /internal/user/key/rotate
  v
rotation handler
  | resolve target key row
  | generateApiKey() -> plaintext + prefix + hash
  | UPDATE api_keys SET key_prefix,key_hash,key_last4,rotated_at?,updated_at,license_key=NULL
  v
Response includes plaintext key (one-time return)
```

## 8.4 Expiry watcher tick

```text
Scheduler (startExpiryWatcher)
  | interval tick
  v
runExpiryWatcherOnce
  | GET_LOCK('pixlab_api_keys_expiry')
  | loop UPDATE active keys where valid_until < NOW() -> disabled+expired
  | loop DELETE keys where status=disabled and subscription_status=expired
  | RELEASE_LOCK
  v
logRuntime(expiry_watcher.complete)
```

---

## 9) Known Unknowns

1. **Event payload authenticity/signature beyond shared bridge token**: no HMAC/signature verification for subscription event payload bodies is present in this repo beyond `x-davix-bridge-token`. (D)
2. **Historical key-hash retention/audit**: no local archival table for previous hashes; unknown whether external system stores prior material. (D)
3. **Cross-system deletion guarantees**: purge endpoint deletes local DB rows (`request_log`, `usage_monthly`, `api_keys`) only; no code evidence of propagation to external systems. (D)

---

## 10) Primary Code Evidence Index

- Key auth and classification: `server.js` (`checkApiKey`, `resolveApiKey`).
- Customer key lookup/provision/state-change: `utils/customerKeys.js`.
- Subscription event ingestion and decisioning: `routes/subscription-route.js` + `utils/subscriptionEvents.js`.
- Plan and schema constraints: `migrations/001_baseline_plans.sql`, `migrations/002_baseline_api_keys.sql`, `migrations/005_baseline_subscription_events.sql`.
- Endpoint feature/limit gating: `utils/limits.js` and route modules.
- Expiry automation: `utils/expiryWatcher.js` + watcher startup in `server.js`.
- Security primitives: `utils/apiKeys.js`, `utils/internalAuth.js`, `utils/signedUrls.js`.
