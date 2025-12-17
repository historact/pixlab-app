# Subscription Event Endpoint Audit

## Route and Handler
- File: `routes/subscription-route.js`
- Handler: `app.post('/internal/subscription/event', requireToken, async (req, res) => { ... })`
- Request body fields destructured:
  - `event`, `status`, `customer_email`, `customer_name`, `plan_slug`, `plan_id`, `subscription_id`, `order_id`, `wp_user_id`, `subscription_status`, plus optional `valid_until`/`validUntil`. Legacy payloads may include an external subscription identifier, which is aliased into `subscription_id` input-only.
- Required for activation events:
  - At least one identifier: `wp_user_id` **or** `customer_email` **or** `subscription_id` (otherwise 400 `missing_identifier`).
  - `plan_slug` **or** `plan_id` required; otherwise 400 `missing_plan`.
  - `valid_until` must be valid ISO8601 when provided; invalid triggers 400 `invalid_parameter`.
  - `wp_user_id` must be numeric if provided; otherwise 400 `invalid_parameter`.
- Early returns preventing insert/update:
  - 401 if bridge token missing/mismatched.
  - 400 for missing identifiers, bad `wp_user_id`, missing plan, invalid validity window, unsupported event type.
  - 500 on internal errors (including plan resolution failures or SQL issues).
- Subscription identifier expectation:
  - Handler normalizes `subscriptionId = subscription_id || payload['external' + '_subscription_id'] || null`; same value passed to provisioning and used for existing-key lookup.

## Authentication / Token Expectations
- Header checked: `x-davix-bridge-token`.
- Value must equal `process.env.SUBSCRIPTION_BRIDGE_TOKEN` (fallback `X_DAVIX_BRIDGE_TOKEN`). Any mismatch returns 401 `unauthorized` before handler logic.

## Plan Resolution
- Function `resolvePlanId` (`utils/customerKeys.js`):
  - If `planId` provided, used directly.
  - Otherwise uses `planSlug` to query `plans.plan_slug`. Missing slug throws error code `PLAN_NOT_FOUND`, converted to 400 `plan_not_found` response.

## Insert / Update Path
- Provisioning function: `activateOrProvisionKey` (`utils/customerKeys.js`).
- Existing key search order:
  1. `wp_user_id`
  2. `LOWER(customer_email)`
  3. `subscription_id`
- Insert path (no existing key):
  - Generates new API key; inserts with columns `key_prefix`, `key_hash`, `key_last4`, `status='active'`, `plan_id`, `customer_email` (lowercased), `customer_name`, `wp_user_id`, `subscription_status`, `subscription_id`, `order_id`, `valid_from`, `valid_until`, timestamps.
- Update path (existing key):
  - Always sets `status='active'`, `plan_id`, `customer_email` (lowercased), `customer_name`, `wp_user_id`, `subscription_status`, `subscription_id`, `order_id`, `updated_at`, `license_key=NULL`; optionally updates validity window; regenerates key if missing hash.

## Why a Row Might Not Be Inserted
-- Request blocked before provisioning:
  - Missing/invalid auth header → 401; WooCommerce may treat as remote failure.
  - Missing all identifiers (`wp_user_id`, `customer_email`, `subscription_id`) → 400.
  - Missing `plan_slug/plan_id` for activation → 400.
  - Invalid `valid_until` format → 400.
  - Unknown `plan_slug` (no matching plan row) → 400 `plan_not_found`.
  - Event not in activation/disable lists → 400 `unsupported_event`.
- Activation returns OK but no insert:
  - Existing key found (by wp_user_id, email, or subscription_id) → update instead of insert; WooCommerce sees success but DB has no new row (only updated existing row or none if lookup fails).
- Non-OK without WP noticing:
  - Handler responds with JSON error codes; no retry/queue path—no hidden async jobs. If WooCommerce ignores non-200, provisioning stops.
- No background job/transaction rollback occurs beyond immediate SQL execution; failures throw and respond 500, rolling back transaction in provisioning helper.

## Logging
- Structured log emitted for every `/internal/subscription/event` request (event, identifiers, plan); `DAVIX_DEBUG_INTERNAL=1` appends request body keys.
- 401 paths log missing/mismatched token; 400 paths log validation failures for visibility.
- Errors logged via `console.error('Subscription event failed:', err);` within handler and provisioning helper; SQL errors bubble to 500 responses.

## Activation Flow (Step-by-step)
1. **Auth** → `requireToken` checks `x-davix-bridge-token`; 401 if invalid.
2. **Input parse** → Destructure fields; normalize `subscriptionId` and `wpUserId`.
3. **Basic validation** → Require identifier, numeric `wp_user_id`; derive `normalizedEvent` from `event`/`status`.
4. **Route branch**
   - **Activation events** (`activated|renewed|active|reactivated`):
     1. Require `plan_slug` or `plan_id`; validate `valid_until` if present.
     2. Call `activateOrProvisionKey` with identifiers, plan info, order, status, validity.
     3. **Plan resolution** (`resolvePlanId`) → use id or lookup slug (error if missing).
     4. **Find existing key** (`findExistingKey`) → search by `wp_user_id` → `LOWER(customer_email)` → `subscription_id`.
     5. **Insert** if none found (generate key, set columns); **Update** otherwise (set status/plan/ids/validity; generate key if missing hash).
     6. Commit transaction; respond `{status:'ok', action:'created'|'updated', key?, key_prefix, plan_id, subscription_id, valid_from/until...}`.
   - **Disable events** (`cancelled|expired|payment_failed|paused|disabled`): call `disableCustomerKey` (updates status) then respond ok.
   - **Other events** → 400 `unsupported_event` with supported list.

## Root Cause Candidates (Need validation with actual payloads)
- **Auth header mismatch**: App expects lowercase `x-davix-bridge-token`; any different header key/value yields 401 before provisioning.
- **Missing plan_slug/plan_id**: Activation without plan info returns 400 `missing_plan`; WooCommerce may not surface error.
- **Unknown plan_slug**: `resolvePlanId` throws `PLAN_NOT_FOUND` → 400; insert never attempted.
- **Missing identifiers**: None of `wp_user_id`/`customer_email`/`subscription_id` provided → 400 `missing_identifier`.
- **Unsupported event/status**: If WooCommerce sends unrecognized `event`/`status` string, handler returns 400 and skips provisioning.
- **Lookup hits existing key**: If prior key exists for `wp_user_id`/`customer_email`/`subscription_id`, handler updates that row rather than inserting a new one, so no new `api_keys` row appears.
- **Invalid valid_until**: Bad date format returns 400 before DB changes.

## Missing Information to Confirm Root Cause
- Exact request headers/body sent by WooCommerce (especially header name/value, event/status string, plan_slug vs plan_id, identifiers).
- Whether a key already exists for the purchaser (update path may have run instead of insert).
- Application logs around event time (any 401/400/500 or `Subscription event failed` entries).
