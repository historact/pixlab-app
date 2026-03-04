# 12) API Reference — Internal `/internal/*`

All endpoints require internal middleware auth (`x-davix-bridge-token`, optional allowlist, internal rate-limit).

## Endpoint list and contracts

| Endpoint | Method | Parameters (body/query) | Success shape | Common errors |
|---|---|---|---|---|
| `/internal/ping` | GET | none | `{status,service,time_utc,auth,db}` | `unauthorized`, `ip_not_allowed`, `internal_rate_limited` |
| `/internal/user/purge` | POST | `api_key_id` OR `api_key_ids[]` OR any identifier (`wp_user_id`,`customer_email`,`subscription_ids[]`,`order_ids[]`), optional `reason` | `{ok,resolved_api_key_ids,deleted,reason}` | `invalid_parameter`,`missing_identifier`,`internal_error` |
| `/internal/user/lookup-key-id` | POST | one of `wp_user_id`,`customer_email`,`subscription_id`,`order_id` | `{status,api_key_id,identity_used}` | `invalid_parameter`,`missing_identifier`,`not_found`,`internal_error` |
| `/internal/user/summary` | POST | same identifiers as lookup | `{status,identity_used,user,plan{quota_mode+scoped_limits},key,usage}` | `invalid_parameter`,`missing_identifier`,`api_key_missing_needs_resync`,`user_summary_failed` |
| `/internal/user/reconcile` | POST | identifier(s) + optional `customer_name`,`plan_slug`,`plan_id`,`subscription_status`,`valid_from`,`valid_until` | `{status,action,key,key_prefix,key_last4,api_key_id,...}` | `invalid_parameter`,`missing_identifier`,`plan_not_found`,`user_reconcile_failed` |
| `/internal/user/logs` | POST | identifier(s) + paging/filter (`page`,`per_page`,`endpoint`,`status`,`from`,`to`) | `{status,page,per_page,total,items[]}` | `invalid_parameter`,`missing_identifier`,`not_found`,`user_logs_failed` |
| `/internal/user/usage` | POST | identifier(s) + `range` (`hourly`,`daily`,`monthly`,`billing_period`) + `window` object (`hours|days|months`) | `{status,range,identity_used,labels,series}` | `invalid_parameter`,`invalid_range`,`missing_identifier`,`not_found`,`user_usage_failed` |
| `/internal/subscription/event` | POST | subscription event payload: `event/status`, identity fields, plan fields, validity fields, ids | event-dependent `{status,action,...}` and duplicate/ignored variants | `invalid_parameter`,`unsupported_event`,`plan_not_found`,`internal_error` |
| `/internal/wp-sync/plan` | POST | `plan_slug` required, plus plan fields (`name`,`billing_period`,`monthly_quota_files`, feature gates, limits, etc.) | `{status,action,plan_slug}` | `missing_plan_slug`,`plan_sync_failed` |
| `/internal/admin/plans` | GET | none | `{status,items[]}` | `plans_list_failed` |
| `/internal/admin/keys` | GET | query: `page`,`per_page`,`search` | `{status,items,total,page,per_page}` | `keys_list_failed` |
| `/internal/admin/keys/export` | GET | query: `page`,`per_page`,`search`,`updated_after` | `{status,page,per_page,total,total_pages,items[]}` | `invalid_parameter`,`keys_export_failed` |
| `/internal/admin/key/provision` | POST | `plan_slug` required + identity fields + optional `reactivated`,`valid_from`,`valid_until` | `{status,action,key,key_prefix,key_last4,...}` | `missing_plan`,`invalid_parameter`,`plan_not_found`,`provision_failed` |
| `/internal/admin/key/disable` | POST | one identifier: `subscription_id`/`customer_email`/`wp_user_id` | `{status,action,affected}` | `missing_identifier`,`invalid_parameter`,`disable_failed` |
| `/internal/admin/key/rotate` | POST | `subscription_id` or `customer_email` | `{status,action,key,key_prefix,key_last4,subscription_id}` | `missing_identifier`,`not_found`,`rotate_failed` |
| `/internal/user/key/rotate` | POST | one identifier among `wp_user_id`,`subscription_id`,`customer_email`,`order_id` | `{status,action,identity_used,key,...}` | `missing_identifier`,`invalid_parameter`,`not_found`,`user_rotate_failed` |
| `/internal/user/key/toggle` | POST | one identifier + `action` (`enable`/`disable`) | `{status,action,identity_used,new_status,...}` | `missing_identifier`,`invalid_action`,`subscription_expired`,`not_found` |
| `/internal/subscription/debug` | GET (dev diagnostics path) | none | debug JSON | same as diagnostics middleware + internal errors |
| `/internal/admin/diagnostics/health` | GET (diagnostics path) | none | `{status,db,db_schema_ok,missing_columns,missing_indexes}` diagnostics JSON | `unauthorized`,`ip_allowlist_required`,`ip_not_allowed`,`internal_rate_limited`,`db_unavailable` |
| `/internal/admin/monitoring/snapshot` | GET (diagnostics path) | optional query `rule_id` | image binary (`image/png` default) | `unauthorized`,`ip_allowlist_required`,`ip_not_allowed`,`internal_rate_limited`,`snapshot_failed` |
| `/internal/admin/monitoring/metrics` | GET (diagnostics path) | none | metrics snapshot JSON | `unauthorized`,`ip_allowlist_required`,`ip_not_allowed`,`internal_rate_limited` |
| `/internal/admin/monitoring/snapshot-view` | GET (diagnostics path) | optional query `rule_id` | HTML diagnostics view | `unauthorized`,`ip_allowlist_required`,`ip_not_allowed`,`internal_rate_limited`,`snapshot_failed` |
| `/internal/admin/monitoring/snapshot-debug/ping` | GET (diagnostics path) | none | `{ok,snapshot_debug_enabled,...}` | `unauthorized`,`ip_allowlist_required`,`ip_not_allowed`,`internal_rate_limited` |



### `/internal/wp-sync/plan` parameters (optional unless marked required)

- required: `plan_slug`
- optional existing fields: `name`, `billing_period` (`monthly|yearly`), `monthly_quota_files`, `max_files_per_request`, `max_total_upload_mb`, `max_dimension_px`, `timeout_seconds`, `allow_h2i`, `allow_image`, `allow_pdf`, `allow_tools`, `is_free`, `description`.
- optional extended fields: `timeout_ms`, `max_upload_bytes_per_file`, `h2i_enabled`, `h2i_max_html_chars`, `h2i_max_render_width`, `h2i_max_render_height`, `h2i_max_render_pixels`, `image_enabled`, `image_max_dimension_px`, `image_max_total_upload_mb`, `image_max_files_per_request`, `pdf_enabled`, `pdf_max_total_upload_mb`, `pdf_max_files_per_request`, `pdf_max_pages_to_images`, `pdf_max_pages_extract_images`, `pdf_max_pages_split`, `tools_enabled`, `tools_max_dimension_px`, `tools_max_total_upload_mb`, `tools_max_files_per_request`, `quota_mode` (`monthly_total_only|monthly_scoped_only|monthly_both`), `monthly_h2i_limit`, `monthly_image_limit`, `monthly_pdf_limit`, `monthly_tools_limit`, `burst_limit_per_min`, `burst_window_seconds`, `burst_applies_to` (`h2i|all`).

## Diagnostics endpoint notes
- `/internal/admin/diagnostics/health` purpose: check DB + schema health for internal diagnostics; guarded by `diagnosticsInternalMiddleware` in `server.js`.
- `/internal/admin/monitoring/snapshot` purpose: render a monitoring snapshot image for alert diagnostics/testing; guarded by `diagnosticsInternalMiddleware` in `server.js`.
- Required auth/headers (both): `x-davix-bridge-token` header is required, plus diagnostics allowlist gate (non-empty internal allowlist requirement) and internal rate limiting.
- Brief response examples:
  - diagnostics health: `{ "status": "ok", "db": "up", "db_schema_ok": true, "missing_columns": [], "missing_indexes": [] }`
  - monitoring snapshot: binary image payload (`Content-Type: image/png`) on success.

## Output + signing
- Internal endpoints return JSON envelopes and do **not** return signed static file URLs (except references to external endpoints in hints).

## Known unknowns
- **(D)** `/internal/subscription/event` has multiple branches (`APPLIED`, `IGNORED_*`, duplicate flows), and response details vary by event chronology and existing key state.
