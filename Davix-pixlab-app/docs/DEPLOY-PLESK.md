# Deploying PixLab on Plesk

## Introduction

PixLab is a Node.js-based rendering and processing service for images, PDFs, and HTML-to-image (H2I) workflows.

This guide explains a practical, manual deployment flow for running PixLab on a Plesk-managed Linux server. It is written for users who may be new to PixLab and want a reliable first production deployment.

## Server Requirements

Before deployment, make sure your Plesk server has all required runtime dependencies:

- **Node.js 22.x**
- **MySQL or MariaDB**
- **Chromium / Puppeteer-compatible browser runtime**
- **qpdf**
- **pdftoppm** (from Poppler, usually `poppler-utils`)
- **Basic Linux build tools** (needed for native Node module compilation on some hosts)

These dependencies are required for PixLab pipelines to work correctly:

- Image processing pipeline
- PDF pipeline
- H2I (HTML-to-Image) pipeline via Puppeteer/Chromium

## Environment Templates

PixLab documentation includes two environment template files:

- `docs/pixlab.env.template`
- `docs/pixlab.production.env.template`

> Important: These are **not** two separate PixLab modes or two competing configuration types.

They are **two parts of the same complete environment configuration**:

- **`pixlab.env.template`**
  - Main runtime `.env` template
  - Includes limits, cleanup jobs, pipeline settings, retention settings, and runtime controls
  - Intended to be your base `.env` file

- **`pixlab.production.env.template`**
  - Additional production variables
  - Includes API keys, admin secrets, database settings, signing secrets, and integrations
  - Often entered through the Plesk Node.js environment variables panel

Together, both templates represent the **full set of environment settings supported by PixLab**.

### Two valid usage patterns

1. **Option A — Merge approach**
   - Merge content from both template files into one `.env`
   - Run PixLab using that single `.env`

2. **Option B — Split approach (recommended for Plesk)**
   - Use `pixlab.env.template` content in your `.env` file
   - Add `pixlab.production.env.template` values in the Plesk UI environment variables panel

Both approaches are equivalent and supported.

### Placeholder reminder

Before production start, replace all placeholder values (passwords, secrets, tokens, hosts, base URLs, etc.) with real production-safe values.

## Plesk Deployment Steps

Follow these steps in order.

### 1) Create database and database user in Plesk

- Create a new MySQL/MariaDB database.
- Create a dedicated DB user.
- Grant required privileges on that database (at least migration-related DDL + normal DML permissions).

### 2) Upload PixLab application files

- Upload PixLab source files to your Plesk Node.js app directory.
- Confirm `package.json` is present in the app root.

### 3) Configure the Node.js application

In Plesk Node.js settings:

- Select **Node.js 22.x**.
- Set app startup file/command according to your Plesk setup so production can run `npm start`.
- Optionally define `ENV_FILE` if you want explicit file-based env loading.

PixLab env loading order is:

1. `ENV_FILE` (if set)
2. `<repo>/.env`
3. Process environment variables

### 4) Install system dependencies (Chromium, qpdf, poppler)

Install required OS packages on the server:

- Chromium (or compatible browser runtime for Puppeteer)
- `qpdf`
- Poppler package that provides `pdftoppm`
- Build tools for native Node modules

Make sure the binaries are available in the runtime PATH.

### 5) Configure environment variables (choose one approach)

Use one of the following:

- **Merge approach:** one complete `.env` file containing merged values from both templates.
- **Split approach (recommended on Plesk):**
  - `.env` based on `pixlab.env.template`
  - Plesk UI env vars based on `pixlab.production.env.template`

In both cases, verify that all required production values are set and no placeholders remain.

### 6) Install dependencies

From the app directory:

```bash
npm ci
```

If your hosting flow cannot run `npm ci`, use `npm install` as fallback.

### 7) Run migrations

```bash
npm run migrate
```

### 8) Verify schema

```bash
npm run verify-schema
```

### 9) Run production verification

```bash
npm run verify:prod
```

### 10) Start the application

```bash
npm start
```

After start, test health:

- `GET /health` should return HTTP 200.

## Before First Start Checklist

Review this checklist to avoid common production startup mistakes:

- Database credentials are correct (`DB_HOST`, `DB_USER`, `DB_PASS`, `DB_NAME`)
- `PUBLIC_BASE_URL` points to the real public HTTPS domain
- `INTERNAL_ALLOWED_IPS` is configured (must not be empty in production)
- `SIGNED_URL_SECRET` is set
- `SIGNED_URL_TTL_SECONDS` is set
- `REQUIRE_SIGNED_OUTPUT_URLS=true`
- `PUPPETEER_NO_SANDBOX=false` (must remain false)
- Admin credential placeholders are replaced (`ADMIN_PASS`, `ADMIN_PASSWORD_HASH`, `ADMIN_TOTP_SECRET`, `ADMIN_SESSION_SECRET`)

## Troubleshooting

### Startup failure signatures (before listener bind)

PixLab runs startup verification before it begins accepting HTTP traffic. If a required runtime check fails, startup exits before the listener is bound.

Common pre-listener failures include:
- Dependency checks (`qpdf`, `pdftoppm`) failing during startup verification.
- Sharp or Puppeteer probe verification failures.
- Production env validation failures (for example unsafe or missing required settings).

If this happens, inspect startup logs first; the app may never reach a state where `/health` is available.

### Puppeteer/Chromium launch failure

- Confirm Chromium is installed and executable.
- If needed, set `PUPPETEER_EXECUTABLE_PATH` to system Chromium.
- Keep `PUPPETEER_NO_SANDBOX=false` in production.

### Missing qpdf or poppler tools

- Install packages providing `qpdf` and `pdftoppm`.
- Re-run production verification:

```bash
npm run verify:prod
```

### Node native module compilation failures

- Ensure Node.js 22.x is active in Plesk.
- Install Linux build tools and required development libraries.
- Rebuild native modules if needed:

```bash
npm rebuild bcrypt sharp
```

### Database privilege errors during migrations

- Grant required privileges for schema migrations (`CREATE`, `ALTER`, `INDEX`, plus standard DML rights).
- Re-run:

```bash
npm run migrate
npm run verify-schema
```

### Health endpoint failing

- Check app logs in Plesk.
- Verify env values are loaded from the expected source (`ENV_FILE`, `.env`, or Plesk UI vars).
- Confirm DB connectivity and migration status.

### Signed URL errors

- Ensure `SIGNED_URL_SECRET` is present and consistent.
- Ensure `SIGNED_URL_TTL_SECONDS` is a valid integer.
- Ensure `REQUIRE_SIGNED_OUTPUT_URLS` is not disabled.

### Environment variable changes not applied

- Restart the Node.js app in Plesk after changing environment variables.
- Re-run `npm run verify:prod` after restart.

## Post-Deployment Verification

Use this quick validation sequence after deployment:

1. **Health check**
   - `GET /health` returns HTTP 200.
2. **Admin login**
   - Confirm admin authentication works with configured credentials.
3. **API test request**
   - Send a basic API request and confirm a successful response.
4. **Output URL validation**
   - Confirm generated output URLs are signed correctly and usable within TTL.

If all checks pass, your PixLab deployment on Plesk is production-ready.
