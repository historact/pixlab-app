# Usage Tracking

- Customer keys enforce monthly file quotas using `usage.js` (`checkMonthlyQuota`).
- Period key is calendar month or custom cycle derived from `valid_from`/`valid_until` and plan type.
- Each request records: files processed, bytes in/out, endpoint/action, status, IP, UA, and error info into `usage_monthly` and `request_log`.
- Public and owner keys bypass quota checks; public keys still have per-endpoint limits (daily counts, size, dimensions, timeouts).
