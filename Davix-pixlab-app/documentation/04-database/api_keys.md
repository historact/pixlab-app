# api_keys

Columns referenced:
- `id` INT PK
- `key_prefix` VARCHAR used for lookup
- `key_hash` VARBINARY hashed key
- `key_last4` VARCHAR
- `plan_id` FK to `plans`
- `plan_slug`, `plan_name`, `monthly_quota_files` (from joins)
- `customer_email`, `customer_name`
- `subscription_id`, `order_id`, `wp_subscription_id`, `wp_order_id`
- `status` (active/disabled)
- `valid_from`, `valid_until`
- `wp_user_id`, `notes`, timestamps

Read/write locations: `utils/customerKeys.js` (lookup, plan healing), `routes/subscription-route.js` (provision, disable, rotate), migrations.
