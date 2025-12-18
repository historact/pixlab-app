# Logging and Observability

- `usage.js` writes aggregated counts to `usage_monthly` and per-request rows to `request_log` via `utils/requestLog.js`.
- `utils/logger.js` centralizes error logging (writes to console/structured logs).
- Diagnostics endpoint `/internal/admin/diagnostics/request-log` validates schema and insertion capability.
- Retention cleanup can prune old `request_log` and `usage_monthly` rows based on `RETENTION_*` env settings.
