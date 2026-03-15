# Deploying PixLab on Plesk (AlmaLinux 9)

This guide describes the recommended production deployment workflow for PixLab on a **Plesk-managed AlmaLinux 9 server**.

It follows the real deployment sequence used by PixLab:

1. Upload app
2. Install dependencies
3. Run migrations
4. Verify schema
5. Configure Plesk Node.js
6. Start application
7. Verify health endpoint

---

## 1) Requirements

Before deployment, ensure the server has:

- **AlmaLinux 9**
- **Plesk Panel** with the Node.js extension enabled
- **Node.js 22.x**
- **MySQL or MariaDB** database
- **SSH access** to the server
- **Google Chrome or Chromium** installed on the server

PixLab uses **Puppeteer** for HTML-to-image/PDF flows, so a Chromium-compatible browser runtime is required.

Recommended additional OS tools for full pipeline readiness:

- `qpdf`
- `pdftoppm` (typically from `poppler-utils`)

---

## 2) Placeholder Variables

Use placeholders in this guide and replace them with your real values:

- `<DOMAIN_ROOT>`
- `<APP_DIRECTORY>`
- `<ENV_FILE_PATH>`
- `<DOMAIN>`
- `<DB_NAME>`
- `<DB_USER>`
- `<DB_PASS>`
- `<SERVER_USER>`
- `<SERVER_HOST>`
- `<PIXLAB_REPOSITORY_URL>`

> Replace every placeholder before running commands in production.

---

## 3) Download PixLab

Use either Git clone or ZIP download:

```bash
git clone <PIXLAB_REPOSITORY_URL>
```

Or download the repository ZIP from your source control host and extract it locally before upload.

---

## 4) Upload the Application to the Server

Upload PixLab into:

```text
<DOMAIN_ROOT>/<APP_DIRECTORY>
```

Expected project structure (minimum):

```text
<DOMAIN_ROOT>/<APP_DIRECTORY>/
├── package.json
├── server.js
├── migrations/
├── routes/
├── scripts/
└── utils/
```

---

## 5) Connect via SSH

```bash
ssh <SERVER_USER>@<SERVER_HOST>
cd <DOMAIN_ROOT>/<APP_DIRECTORY>
ls
```

Confirm required files/folders are present (`package.json`, `server.js`, `migrations/`, `routes/`, `scripts/`, `utils/`).

---

## 6) Environment Configuration

Store your production `.env` file **outside** the application directory.

Example path:

```text
<ENV_FILE_PATH>
```

Example `.env` template:

```dotenv
NODE_ENV=production

DB_HOST=localhost
DB_NAME=<DB_NAME>
DB_USER=<DB_USER>
DB_PASS=<DB_PASS>

PUBLIC_BASE_URL=https://<DOMAIN>

PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome
PUPPETEER_NO_SANDBOX=false
```

PixLab supports loading an external env file via:

```bash
ENV_FILE=<ENV_FILE_PATH>
```

PixLab env loading order is:

1. `ENV_FILE` (if set)
2. `<app root>/.env`
3. Process environment variables from Plesk

---

## 7) Install Dependencies

From the application directory:

```bash
npm install
```

If a lockfile exists (`package-lock.json`), prefer deterministic installs:

```bash
npm ci
```

Do **not** run this during deployment:

```bash
npm audit fix --force
```

---

## 8) Run Database Migration

```bash
ENV_FILE=<ENV_FILE_PATH> npm run migrate
```

This creates/updates PixLab database tables required by the current release.

---

## 9) Verify Schema

```bash
ENV_FILE=<ENV_FILE_PATH> npm run verify-schema
```

This checks schema integrity and confirms the DB structure matches PixLab expectations.

---

## 10) Production Verification

```bash
ENV_FILE=<ENV_FILE_PATH> NODE_ENV=production npm run verify:prod
```

This validates runtime readiness (environment safety checks, dependency checks, and production preflight validations).

---

## 11) Configure Node.js in Plesk

In **Plesk → Domains → Node.js** configure:

- **Node version:** `22.x`
- **Application root:** `<DOMAIN_ROOT>/<APP_DIRECTORY>`
- **Startup file:** `server.js`

Set environment variables in Plesk:

```text
NODE_ENV=production
ENV_FILE=<ENV_FILE_PATH>
```

After saving, click **Restart App** in Plesk so settings are applied.

---

## 12) Start Application

Use Plesk to start/restart the Node.js app (recommended), or from SSH if your workflow requires:

```bash
ENV_FILE=<ENV_FILE_PATH> NODE_ENV=production npm start
```

In production, prefer letting Plesk/Passenger manage process lifecycle.

---

## 13) Health Check

Verify the application responds:

```bash
curl -i https://<DOMAIN>/health
```

Expected response body:

```json
{
  "status": "ok",
  "db": "up"
}
```

---

## 14) Production Notes

- Do **not** run PixLab as `root`.
- Let **Plesk/Passenger** manage the Node.js process.
- Keep Puppeteer sandbox enabled in production:
  - `PUPPETEER_NO_SANDBOX=false`

If Chromium path differs on your server, set `PUPPETEER_EXECUTABLE_PATH` accordingly.

---

## 15) Updating the Application Safely

Use this upgrade sequence for new PixLab releases:

1. Upload the new version to `<DOMAIN_ROOT>/<APP_DIRECTORY>`.
2. Install/update dependencies.
3. Run migrations.
4. Verify schema.
5. Restart app in Plesk.

Commands:

```bash
cd <DOMAIN_ROOT>/<APP_DIRECTORY>
npm install
ENV_FILE=<ENV_FILE_PATH> npm run migrate
ENV_FILE=<ENV_FILE_PATH> npm run verify-schema
```

Then restart the app from the Plesk Node.js panel and re-run the health check.
