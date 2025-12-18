# request_log

Columns managed by `utils/requestLog.js` include:
- `id` INT PK
- `api_key_id` FK
- `timestamp` DATETIME
- `endpoint`, `action`, `status`
- `ip`, `user_agent`
- `bytes_in`, `bytes_out`, `files_processed`
- `error_code`, `error_message`
- `params_json`

Schema enforced at runtime by `ensureRequestLogSchema` and used by `usage.js` to store per-request logs.
