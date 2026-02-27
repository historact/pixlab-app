# 03 - Dependencies and Runtime Requirements

This inventory is evidence-based from `package.json`, `package-lock.json`, and direct code usage sites.

## Node Dependencies (grouped)

### Version source notes
- **Pinned version** below is taken from `package-lock.json` when a `packages["node_modules/<name>"]` entry exists.
- If lockfile has **no package entry**, the dependency is marked **`not pinned in current lockfile`** and only the semver range from `package.json` is available.

| Dependency | Declared as | Version in `package.json` | Pinned in lockfile | Purpose group | Evidence of usage/imports |
|---|---:|---:|---:|---|---|
| express | dependency | `^4.19.2` | `4.22.1` | server/api | `server.js`, `admin/adminRoutes.js` (`require('express')`). |
| body-parser | dependency | `^1.20.3` | `1.20.4` | server/api | `server.js` (`bodyParser.json`, `bodyParser.urlencoded`). |
| cookie-parser | dependency | `^1.4.6` | not pinned in current lockfile | auth/security | `server.js` (`app.use(cookieParser())`). |
| express-session | dependency | `^1.17.3` | not pinned in current lockfile | auth/security | `server.js` (`session({...})`). |
| express-mysql-session | dependency | `^2.1.8` | not pinned in current lockfile | auth/security, db/storage | `server.js` (`const MySQLStore = require('express-mysql-session')(session)`). |
| mysql2 | dependency | `^3.11.0` | not pinned in current lockfile | db | `server.js` (`mysql.createPool`), `db.js` (`mysql2/promise`). |
| bcrypt | dependency | `^5.1.1` | not pinned in current lockfile | auth/security | `utils/apiKeys.js`, `utils/adminAuth.js`, `scripts/gen-admin-password-hash.js`. |
| argon2 | optionalDependency | `^0.41.1` | not pinned in current lockfile | auth/security | `utils/apiKeys.js` optional load + hash/verify path. |
| otplib | dependency | `^12.0.1` | not pinned in current lockfile | auth/security | `admin/adminRoutes.js`, `utils/adminAuth.js` (`authenticator`). |
| multer | dependency | `^1.4.5-lts.1` | `1.4.5-lts.2` | server/api, upload tooling | `utils/uploadLimits.js` (`multer.MulterError`, custom storage engine). |
| sharp | dependency | `^0.33.0` | `0.33.5` | image, pdf, tooling | `routes/image-route.js`, `routes/pdf-route.js`, `routes/tools-route.js`, `utils/uploadLimits.js`. |
| exifr | dependency | `^7.1.3` | not pinned in current lockfile | image tooling | `routes/image-route.js`, `routes/tools-route.js`. |
| pdf-lib | dependency | `^1.17.1` | not pinned in current lockfile | pdf | `routes/pdf-route.js`, `routes/image-route.js`. |
| puppeteer | dependency | `^24.15.0` | `24.32.1` | image/pdf rendering, monitoring/alerts | `routes/h2i-route.js`, `utils/monitoringSnapshot.js`, runtime diagnostics in `server.js`. |
| uuid | dependency | `^9.0.1` | `9.0.1` | tooling (IDs for outputs/temp files) | `routes/h2i-route.js`, `routes/image-route.js`, `routes/pdf-route.js`. |
| nodemailer | dependency | `^6.9.15` | not pinned in current lockfile | monitoring/alerts | `utils/alerts.js` for SMTP transport and message delivery. |

### No devDependencies currently declared
`package.json` contains no `devDependencies` section.

## System Dependencies

> Only includes items that are code-enforced or directly used from execution paths.

| Requirement | Type | Why required | Evidence |
|---|---|---|---|
| Node.js 22.x | runtime | Engine expectation is declared in package metadata. | `package.json` -> `"engines": { "node": "22.x" }`. |
| MySQL server reachable via `DB_*` | external service / DB | App pools and admin session store both connect using MySQL credentials; migrations run against same DB. | `db.js` (`mysql2/promise` pools, `runMigrations`), `server.js` (`mysql.createPool`, `express-mysql-session` store). |
| `qpdf` binary | system binary | Required for `/v1/pdf` `encrypt` and `decrypt`; route checks `qpdf --version` and errors if absent. | `routes/pdf-route.js` (`qpdfExists`, `runQpdf`, `sendError(... 'qpdf not installed')`). |
| `pdftoppm` binary | system binary | Used for PDF-to-image extraction path; command is spawned directly. | `routes/pdf-route.js` (`runCommandWithSignal('pdftoppm', ...)`). |
| Chromium runtime used by Puppeteer | browser runtime | HTML-to-image/PDF and alert snapshot renderer launch Puppeteer browser instances. | `routes/h2i-route.js` (`puppeteer.launch`), `utils/monitoringSnapshot.js` (`puppeteer.launch`). |

### Startup dependency enforcement
- `checkStartupDependencies()` runs during server boot and checks `qpdf --version` and `pdftoppm -v` before the HTTP listener starts.
- In production (`NODE_ENV=production`), missing dependencies throw and terminate startup (`process.exit(1)` in `startServer()` catch path).
- In non-production, missing dependencies are warned but do not hard-stop startup.


### Minimal install guidance (non-guessy)
- Install **`qpdf`** so `qpdf --version` succeeds on the runtime PATH.
- Install **Poppler tools (`pdftoppm`)** so `pdftoppm -v` succeeds on the runtime PATH (commonly provided by a `poppler-utils` package).
- Keep Chromium available for Puppeteer (`puppeteer` bundled browser or `PUPPETEER_EXECUTABLE_PATH`).

When startup dependency checks fail, PixLab logs the missing command name and install hint and, in production, aborts startup.

### OS/package-level notes (evidence-bounded)
- The codebase **does not explicitly install apt/yum packages**; therefore OS package names (fonts/lib dependencies) are **not code-confirmed** in this repo.
- Puppeteer and Sharp may require platform-compatible runtime support, but this repository itself only proves direct use of those Node modules and binaries above.

## Runtime Requirements & Permissions

### Environment + process expectations
- `ADMIN_SESSION_SECRET` is mandatory at startup; app exits if missing.
- DB envs `DB_HOST`, `DB_USER`, `DB_PASS`, `DB_NAME` are used for both normal queries and session/migration pools.
- `AUTO_RUN_MIGRATIONS` controls whether startup attempts automatic migration when schema checks fail.
- `PUPPETEER_NO_SANDBOX` controls Chromium launch args (`--no-sandbox`, `--disable-setuid-sandbox`), defaulting to true outside production.

### Filesystem paths that must exist / be writable
- App ensures and writes under `public/` subdirs: `public/h2i`, `public/image`, `public/pdf`, `public/tools` (and serves `/img-edit/*` as an alias to `public/image`).
- Upload temp path: `os.tmpdir()/pixlab-uploads`, created with directory mode `0700`; upload files written with mode `0600`.
- Monitoring snapshots: `os.tmpdir()/pixlab-alert-snapshots` (created recursively).
- Logs: resolved log dir (default `var/logs` fallback chain), created recursively before writes.

### Database type + schema/migrations tool
- DB type is MySQL (`mysql2` driver and SQL against `information_schema`).
- Migration mechanism: SQL files in `/migrations` tracked by `schema_migrations`, executed by `db.runMigrations()` and CLI script `npm run migrate` (`node scripts/run-migrations.js`).

## Optional/Feature-Gated Dependencies

| Item | Classification | Trigger / condition | Behavior when unavailable |
|---|---|---|---|
| `argon2` (Node optionalDependency) | optional/conditional | `utils/apiKeys.js` tries to require `argon2`; if present, preferred for hashing (`argon2id`). | Falls back to `bcrypt`, then to `crypto.scrypt`; verifying an argon2 hash without argon2 throws explicit error. |
| `bcrypt` availability in API-key utility | conditional runtime path | `utils/apiKeys.js` also loads `bcrypt` in try/catch and uses when argon2 absent. | If both argon2 and bcrypt absent, hashing uses `scrypt`; bcrypt hashes cannot be verified without bcrypt. |
| `qpdf` binary | feature-gated system dependency | Required only for `encrypt` / `decrypt` actions in `/v1/pdf`. | Request returns `400 invalid_parameter` with `qpdf not installed`. |
| Puppeteer no-sandbox mode | env-configurable | `PUPPETEER_NO_SANDBOX=true` adds Chromium no-sandbox args. | When false, launches without those args. |

## Troubleshooting missing deps

| Symptom / error text | Where observed | Likely missing item | Fix |
|---|---|---|---|
| `qpdf not installed` (HTTP 400 `invalid_parameter`) | `/v1/pdf` action `encrypt` or `decrypt` | `qpdf` binary not available in PATH | Install `qpdf` on host and ensure service PATH can resolve it. |
| process exits with `ADMIN_SESSION_SECRET is required.` | startup | `ADMIN_SESSION_SECRET` env variable | Set a strong `ADMIN_SESSION_SECRET` before start. |
| `argon2 required to verify this key` | API key verification path | optional `argon2` missing while stored hash is argon2 | Install `argon2` module (or rotate keys to a supported hash format). |
| `bcrypt required to verify this key` | API key verification path | `bcrypt` missing while stored hash is bcrypt | Ensure `bcrypt` dependency is installed for this runtime image. |
| spawn/exec errors for `pdftoppm` (ENOENT) during PDF-to-image | `/v1/pdf` conversion path | Poppler `pdftoppm` missing | Install Poppler tools package providing `pdftoppm`. |

## Evidence pointers (source files)
- Dependency declarations: `package.json`, `package-lock.json`.
- Server/runtime wiring: `server.js`, `db.js`, `utils/config.js`, `utils/uploadLimits.js`, `utils/logger.js`, `utils/monitoringSnapshot.js`.
- Feature usage routes: `routes/h2i-route.js`, `routes/image-route.js`, `routes/pdf-route.js`, `routes/tools-route.js`, `admin/adminRoutes.js`.
- Optional hash behavior: `utils/apiKeys.js`.
- Migration CLI: `scripts/run-migrations.js`.


## Production smoke script
- Use `scripts/prod-smoke.js` after deployment against a running server (`BASE_URL` + API key env).
- The script runs `validateEnv()`, startup dependency checks (`qpdf`, `pdftoppm`), and endpoint/output URL smoke checks (including signed URL checks when signing is enabled).
