# WordPress usage mismatch audit (incomplete due to DB client unavailable)

## Environment blockers
- Unable to run required MySQL introspection because `mysql2` dependency is missing and npm installs are blocked by 403 responses from the upstream registry (see `npm install` attempts). This prevents using the existing pool (`db.js`) to execute live queries.

## A) Endpoint behavior (code inspection)
- `/internal/user/summary` (routes/subscription-route.js):
  - Resolves key via `resolveKeyFromIdentifiers` using `subscription_id` OR `external_subscription_id` OR `order_id` OR `wp_order_id` OR `customer_email`, always choosing the most recently `updated_at` row for the provided identifier.
  - Computes `period` with `getPeriodUTC()` → `new Date().toISOString().slice(0,7)` (UTC `YYYY-MM`).
  - Loads usage with `findUsageRow(keyRow.id, period)` → `SELECT * FROM usage_monthly WHERE api_key_id = ? AND period = ? LIMIT 1`.
  - Builds response using that single `usage_monthly` row; per-endpoint calls read `h2i_calls`, `image_calls`, `pdf_calls`, `tools_calls`; `total_calls` defaults to `0` if the row is missing.
- `/internal/user/usage` (routes/subscription-route.js):
  - Also resolves the key via `resolveKeyFromIdentifiers` and uses `api_key_id = keyRow.id`.
  - For `range="monthly"`, it builds a list of UTC `YYYY-MM` labels via `getMonthlyPeriods`, then queries `usage_monthly` for those periods using `IN (...)` filtered by `api_key_id`.
  - For `hourly`/`daily`/`billing_period`, it queries `request_log` with `api_key_id = keyRow.id` and buckets timestamps using `DATE_FORMAT`/`DATE` on the stored `timestamp` column.

## B) Period mismatch check (code-only)
- Computed period format: `YYYY-MM` in UTC (`getPeriodUTC` and `getCurrentPeriod` in usage.js are consistent).
- Expected DB period format: same `YYYY-MM` string (from INSERT path in `usage.js`).
- Live DB periods could not be inspected because the MySQL client could not be installed; no mismatch detected in code paths.

## C) Data source usage
- Summary endpoint exclusively reads `usage_monthly` (not `request_log`).
- Usage chart endpoint reads `usage_monthly` for `monthly` range; other ranges use `request_log` buckets. Both use `api_key_id = keyRow.id` from resolver.

## D) Billing window fields
- `api_keys` schema includes `valid_from` / `valid_until` (per migration). `/internal/user/summary` now returns those values when present and falls back to the first day of the current UTC month when a validity start is missing.

## E) Limit fields
- Plan resolution: `/internal/user/summary` tries `plan_id` then `plan_slug` to load from `plans`. It exposes `monthly_call_limit` and `monthly_quota_files` from the plan row. If the plan row is missing, both limits become `null`.
- If `plans` lacks `monthly_call_limit`, the value will be `null` (no fallback to another column).

## F) Root cause (evidence-limited)
- Code will return `total_calls = 0` when no `usage_monthly` row exists for the current UTC period. Without DB access, the most probable causes are: (a) live `usage_monthly.period` strings differ from `YYYY-MM` (e.g., local time or `YYYYMM`), or (b) usage rows are tied to a different `api_key_id` than the resolver returns (e.g., different subscription/order/email linkage). Both would make `/internal/user/summary` miss existing usage and render zeros.

## G) Minimal fix plan (once DB is reachable)
1) Verify live `api_keys.id` produced by `resolveKeyFromIdentifiers` matches the `api_key_id` that accumulates usage; if not, align resolver fields or usage writer to the same key row.
2) Confirm `usage_monthly.period` values; if they use a different format or timezone, adjust `getPeriodUTC`/`getCurrentPeriod` and the queries to match the stored format.
3) Include `valid_from`/`valid_until` in the summary payload to reflect the actual billing window when available; otherwise, fall back to month start/end.
4) If `plans.monthly_call_limit` is unused in schema, map to the correct limit column (e.g., `monthly_quota_files` or plan-based limit) in the summary response.

> Live DB outputs (SHOW COLUMNS, sample rows) were not captured because the environment cannot install `mysql2` to connect with the existing pool.
