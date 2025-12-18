# usage_monthly

Columns referenced:
- `id` INT PK
- `api_key_id` FK
- `period` VARCHAR (YYYY-MM for calendar or cycle key)
- Counters: `used_files`, `used_bytes`, `total_calls`, `total_files_processed`
- Endpoint counters: `h2i_calls`, `h2i_files`, `image_calls`, `image_files`, `pdf_calls`, `pdf_files`, `tools_calls`, `tools_files`
- `bytes_in`, `bytes_out`, `errors`, `last_error_code`, `last_error_message`, `last_request_at`
- Timestamps `created_at`, `updated_at`

Managed by `usage.js` for quota checks and logging per request.
