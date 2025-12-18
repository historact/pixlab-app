# Quota Issues

- Verify customer key has `monthly_quota_files` via plan; free plan quotas come from DB.
- `monthly_quota_exceeded` returned when requested files exceed remaining allowance.
- Usage periods derive from calendar month or plan cycle; ensure validity dates are correct.
