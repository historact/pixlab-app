# Jobs and Cron

- **Daily file cleanup**: `server.js` schedules every 24h to delete assets older than 24h from `public/h2i`, `img-edit`, `pdf`, `tools`.
- **Expiry watcher**: `utils/expiryWatcher.js` started when `EXPIRY_WATCHER_ENABLED` (default true) to deactivate expired keys at intervals defined by env vars.
- **Orphan cleanup**: `utils/orphanCleanup.js` removes unused assets based on DB references; controlled by `ORPHAN_CLEANUP_*` envs.
- **Retention cleanup**: `utils/retentionCleanup.js` prunes old `request_log` and `usage_monthly` records according to retention envs.
