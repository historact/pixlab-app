# Architecture

- **Runtime**: Node.js Express server (`server.js`) serving REST APIs for HTML-to-image, image editing, PDF utilities, and image analysis tools.
- **Storage**: Uses local `public/` directories (`h2i`, `img-edit`, `pdf`, `tools`) to persist generated assets; served as static files.
- **Database**: MySQL via `mysql2/promise` (`db.js`) with tables such as `api_keys`, `plans`, `usage_monthly`, `request_log`, and migration tracking table `schema_migrations`.
- **Auth**: API keys validated via `checkApiKey` middleware in `server.js` with owner, public, and customer key types; customer keys resolved from DB via `utils/customerKeys.js`.
- **Usage tracking**: `usage.js` records per-request usage and writes to `usage_monthly` and `request_log` tables.
- **Routing**: Public v1 endpoints mounted from `routes/*.js`. Internal admin/bridge endpoints live in `routes/subscription-route.js`. Diagnostics endpoint at `/internal/admin/diagnostics/request-log` in `server.js`.
- **Background tasks**: Expiry watcher, orphan cleanup, retention cleanup, and daily file cleanup set up in `server.js` and `utils/*Cleanup.js`.
- **CORS and static hosting**: `server.js` configures CORS from `CORS_ORIGINS` env and serves static generated files.
- **Timeouts and rate limits**: Public keys receive shorter timeouts and per-IP daily limits on specific endpoints; quota enforcement for customer keys is handled per endpoint via `usage.js`.
