# plans

Columns referenced:
- `id` INT PK
- `plan_slug` unique identifier
- `name`
- `monthly_quota_files`
- `billing_period`
- `is_free` boolean

Read by `utils/customerKeys.js` for plan lookup and free plan fallback; also referenced in internal plan sync routes.
