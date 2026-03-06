# Deploying PixLab on Plesk (Manual, Production)

This guide is intentionally manual (no CI/CD automation), for teams deploying by uploading code to Plesk.

## Runtime requirements

- Node.js: **22.x**
- MySQL/MariaDB database
- System binaries on server PATH:
  - `qpdf`
  - `pdftoppm` (usually from `poppler-utils`)
- Puppeteer runtime support:
  - Chromium available (bundled Puppeteer browser or system Chromium)
  - Required shared libs for Chromium on your distro (install distro-recommended Puppeteer/Chromium dependencies)

## Env loading behavior

- PixLab bootstrap loads env in this order:
  1) `ENV_FILE` (if set; absolute path or repo-relative path)
  2) fallback `<repo>/.env`
  3) existing process environment only (if neither file is available)
- In Plesk, panel-defined environment variables are usually enough; `ENV_FILE` is optional and only needed if you want explicit file-based env loading.

## Required production environment variables

Set these in Plesk before first production start:

- `NODE_ENV=production`
- `ADMIN_PASS`
- `ADMIN_PASSWORD_HASH`
- `ADMIN_TOTP_SECRET`
- `ADMIN_SESSION_SECRET`
- `SUBSCRIPTION_BRIDGE_TOKEN`
- `API_KEYS`
- `DB_HOST`
- `DB_USER`
- `DB_PASS` (required when your DB user uses a password)
- `DB_NAME`
- `PUBLIC_BASE_URL`
- `INTERNAL_ALLOWED_IPS` (must be non-empty in production)
- `SIGNED_URL_SECRET`
- `SIGNED_URL_TTL_SECONDS`

Production-safe security toggles (must remain safe):

- `REQUIRE_SIGNED_OUTPUT_URLS=true` (cannot be disabled in production)
- `PUPPETEER_NO_SANDBOX=false`

## Manual deployment steps

1. **Create empty database + user with DDL rights**
   - Create DB and DB user in hosting panel.
   - Grant create/alter/index/insert/update/delete/select on that DB.
2. **Upload code and set env vars in Plesk**
   - Upload extracted repo or git clone.
   - Configure all required env vars above.
3. **Install dependencies**
   - Preferred (deterministic): `npm ci`
   - Fallback (if Plesk flow cannot run ci): `npm install`
4. **Run migrations**
   - `npm run migrate`
   - Recommended even if startup auto-run exists.
5. **Verify schema state**
   - `npm run verify-schema`
6. **Verify production prerequisites**
   - `npm run verify:prod`
7. **Start the app**
   - `npm start`
8. **Confirm health endpoint**
   - `GET /health` should return 200.

## Troubleshooting

- **bcrypt/sharp build issues**
  - Ensure Node 22.x is active.
  - Rebuild native modules: `npm rebuild bcrypt sharp`.
  - Ensure build tooling/libs required by your distro are installed.

- **Puppeteer launch issues**
  - Confirm Chromium executable exists.
  - If using system Chromium, set `PUPPETEER_EXECUTABLE_PATH`.
  - Keep `PUPPETEER_NO_SANDBOX=false` in production.

- **Missing `qpdf` or `pdftoppm`**
  - Install system packages providing these binaries.
  - Re-run `npm run verify:prod`.

- **MySQL permission errors during migrate**
  - Grant DB user DDL rights (`CREATE`, `ALTER`, `INDEX`) and DML rights.
  - Re-run `npm run migrate` then `npm run verify-schema`.

- **Signed URL env missing/misconfigured**
  - Set `SIGNED_URL_SECRET` and valid integer `SIGNED_URL_TTL_SECONDS`.
  - Ensure `REQUIRE_SIGNED_OUTPUT_URLS` is not set to `false`.
