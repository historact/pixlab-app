# Customer API Key Management

This document describes how Davix Pixlab now manages customer API keys without WordPress/LMFWC dependencies.

## Environment variables
- `API_KEYS` – comma-separated owner + customer keys for backwards compatibility (existing behavior preserved).
- `PUBLIC_API_KEYS` – subset of `API_KEYS` treated as public.
- `SUBSCRIPTION_BRIDGE_TOKEN` – shared secret for `/internal/subscription/event` calls.
- `DB_HOST`, `DB_USER`, `DB_PASS`, `DB_NAME` – MySQL connection settings.
- `BASE_URL` – optional, for absolute URLs in responses.
- `VALID_FROM_GRACE_SECONDS` – optional UTC grace (seconds, default 120) applied when setting `valid_from` during provisioning/activation.

## Schema & migrations
- Customer keys are stored as `(key_prefix, key_hash)`; plaintext keys are **never** stored.
- Migration SQL lives in `migrations/001_api_keys_schema.sql` and adds `key_prefix`, `key_hash`, `status`, `external_subscription_id`, and supporting indexes while leaving legacy columns (`license_key`, `wp_*`) marked as deprecated.
- Apply migrations: `npm run migrate` (uses `scripts/run-migrations.js`).

## Key lifecycle
1. **Generate** – `generateApiKey()` builds `dvx_live_<random>` keys (32-48 random chars). The first 16 chars are the lookup prefix; the full key is hashed with Argon2id when available, otherwise bcrypt, and finally scrypt as a built-in fallback.
2. **Store** – `key_prefix`, `key_hash`, `status`, `plan_id`, `customer_email`, and optional `external_subscription_id` are persisted in `api_keys`.
   - Subscription events from WordPress never set `valid_from`; the Node backend always stamps `valid_from = UTC_NOW - VALID_FROM_GRACE_SECONDS` to activate keys immediately.
   - Manual admin provisioning accepts ISO8601 `valid_from`/`valid_until`. "Today/now" inputs are clamped to activate immediately (within grace or 2h timezone offset). Clearly future dates stay future.
3. **Verify** – incoming keys are matched by prefix and hash in middleware (`checkApiKey`). Status and validity windows are enforced; owner/public key behavior is unchanged.

## Subscription bridge endpoint
- `POST /internal/subscription/event`
- Header: `X-Davix-Bridge-Token: <SUBSCRIPTION_BRIDGE_TOKEN>`
- Body: `{ event, customer_email, plan_slug, plan_id?, external_subscription_id?, status?, metadata? }`
- Events `activated|renewed|active|reactivated` create or reactivate a customer key (returns plaintext key on creation).
- Events `cancelled|expired|payment_failed|paused|disabled` disable matching keys (by `external_subscription_id` or `customer_email`).

### Example curl
```bash
export SUBSCRIPTION_BRIDGE_TOKEN=supersecret
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-Davix-Bridge-Token: ${SUBSCRIPTION_BRIDGE_TOKEN}" \
  -d '{"event":"activated","customer_email":"dev@example.com","plan_slug":"starter"}' \
  http://localhost:3005/internal/subscription/event
```

## Smoke script
With the server running locally:
```bash
export SUBSCRIPTION_BRIDGE_TOKEN=supersecret
node scripts/customer-key-smoke.js
```
The script provisions a customer key via the internal endpoint, calls `/v1/tools` with it, and prints the response plus any usage impact.
