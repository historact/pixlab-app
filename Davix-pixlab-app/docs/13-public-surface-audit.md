# PIXLAB PUBLIC SURFACE AUDIT

## STATIC PATHS

Mounted in `server.js`:

- `/assets` -> `./assets` (`path.join(__dirname, 'assets')`), static assets.
- `/h2i` -> `./public/h2i`, generated output, protected by `signedStaticGuard()`.
- `/image` -> `./public/image`, generated output, protected by `signedStaticGuard()`.
- `/pdf` -> `./public/pdf`, generated output, protected by `signedStaticGuard()`.
- `/tools` -> `./public/tools`, generated output, protected by `signedStaticGuard()` when `REQUIRE_SIGNED_OUTPUT_URLS=true`; otherwise served unsigned.

Server startup ensures these directories exist (`mkdirSync(..., { recursive: true })`):

- `public/`
- `public/h2i`
- `public/image`
- `public/pdf`
- `public/tools`
- `assets/`
- `assets/logo`

Security checks in `server.js`:

- No `express.static(__dirname)` or mount of project root.
- `LOG_DIR` is explicitly rejected when configured inside any static root (`assets`, `public/h2i`, `public/image`, `public/pdf`, `public/tools`) and throws in production.

## API ROUTES

### Public/external API

- `GET /health` (defined in `server.js`).
- `GET /health/health` (defined in `server.js`).
- `POST /v1/h2i` (defined in `routes/h2i-route.js`).
- `POST /v1/image` (defined in `routes/image-route.js`).
- `POST /v1/pdf` (defined in `routes/pdf-route.js`).
- `POST /v1/tools` (defined in `routes/tools-route.js`).

### Internal/bridge-protected API (still network-reachable but access-controlled)

- `GET /internal/ping`
- `POST /internal/user/purge`
- `POST /internal/user/lookup-key-id`
- `POST /internal/user/summary`
- `POST /internal/user/reconcile`
- `POST /internal/user/logs`
- `POST /internal/user/usage`
- `POST /internal/subscription/event`
- `POST /internal/wp-sync/plan`
- `GET /internal/admin/plans`
- `GET /internal/admin/keys`
- `GET /internal/admin/keys/export`
- `POST /internal/admin/key/provision`
- `POST /internal/admin/key/disable`
- `POST /internal/admin/key/rotate`
- `POST /internal/user/key/rotate`
- `POST /internal/user/key/toggle`
- `GET /internal/subscription/debug` (only when diagnostics is enabled)

Also in `server.js`:

- `GET /internal/admin/diagnostics/health` (only when diagnostics is enabled)
- `GET /internal/admin/diagnostics/request-log` (only when diagnostics is enabled)
- `GET /internal/admin/monitoring/metrics`
- `GET /internal/admin/monitoring/snapshot-view`
- `GET /internal/admin/monitoring/snapshot`
- `GET /internal/admin/monitoring/snapshot-debug/ping`

### Admin router endpoints

Mounted via `app.use(adminBase, adminRouter)` where:

- `adminBase = /${ADMIN_PATH}/${ADMIN_PASS}`

Routes (prefix omitted; prepend `adminBase`):

- `GET /login`
- `POST /login`
- `POST /logout`
- `GET /logout`
- `GET /bootstrap`
- `POST /bootstrap/ack`
- `GET /`
- `GET /debug/admin-script`
- `GET /api/settings`
- `GET /api/logs/:channel`
- `GET /api/subscription-events/settings`
- `POST /api/subscription-events/settings`
- `GET /api/subscription-events`
- `GET /api/subscription-events/export`
- `POST /api/subscription-events/clear`
- `POST /api/logs/:channel/settings`
- `POST /api/logs/:channel/clear`
- `GET /api/logs/:channel/export`
- `POST /api/alerts/settings`
- `POST /api/alerts/test`
- `GET /api/monitoring/metrics`
- `GET /api/monitoring/range`
- `GET /api/monitoring/alerts/rules`
- `POST /api/monitoring/alerts/rules`
- `POST /api/monitoring/alerts/rules/:id/test`
- `POST /api/monitoring/alerts/rules/:id/delete`
- `GET /api/monitoring/alerts/active`
- `GET /api/monitoring/alerts/resolved`
- `GET /api/monitoring/alerts/deliveries`
- `POST /api/monitoring/alerts/:ruleId/ack`
- `POST /api/monitoring/alerts/:ruleId/silence`

## PRIVATE DIRECTORIES

Not publicly exposed via `express.static()` mounts:

- `routes/`
- `utils/`
- `scripts/`
- `admin/` (contains route handlers, not static)
- `db/`
- `migrations/`

Sensitive files that are not static-mounted:

- `.env` (loaded via `utils/loadEnv`)
- `server.js`
- `db.js`

## LEGACY CLEANUP

Removed legacy image-alias public path references:

- Legacy image alias static mount removed from `server.js`.
- Legacy alias smoke-test checks removed from `scripts/prod-smoke.js`.
- Documentation references replaced with canonical `/image` and `public/image`.

## STATIC OUTPUT FOLDER VERIFICATION

Source code static output directories in use:

- `public/h2i` mounted at `/h2i`
- `public/image` mounted at `/image`
- `public/pdf` mounted at `/pdf`
- `public/tools` mounted at `/tools`
- `assets/` mounted at `/assets`

Note: `public/` directories are created at runtime by `server.js` if absent from the repository checkout.

## SECURITY VERIFICATION

- No project-root static mount found.
- No `express.static(__dirname)` usage found.
- Static mounts are limited to explicit directories only (`assets`, and specific `public/*` output folders).
- Internal endpoints exist under `/internal/*` and are protected in code by internal middleware, not by static serving.
