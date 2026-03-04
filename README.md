<div align="center">

![PixLab logo](./Davix-pixlab-app/assets/logo/logo-128.png)

# PixLab

**Node/Express API for HTML-to-image/PDF rendering, image operations, PDF tooling, and utility transforms.**

[![Node](https://img.shields.io/badge/node-22.x-339933?logo=node.js&logoColor=white)](./Davix-pixlab-app/package.json)
[![License](https://img.shields.io/badge/license-Proprietary-red)](./LICENSE)
[![Docs](https://img.shields.io/badge/docs-available-blue)](./Davix-pixlab-app/docs/01-endpoints-inventory.md)
[![Website](https://img.shields.io/badge/website-official-0ea5e9)](https://h2i.davix.dev)
[![Support](https://img.shields.io/badge/support-contact-22c55e)](https://TODO-insert-official-support-url.example)

</div>

---

## What is PixLab?

PixLab is a backend service that exposes `/v1/*` APIs for rendering HTML/CSS to image or PDF, image editing pipelines, PDF manipulation, and other utility tools. The server is built on Express with MySQL-backed key/subscription data and request/session persistence. It supports API key-based authentication (`X-Api-Key` or `Authorization: Bearer`) for external endpoints and bridge-token auth for internal endpoints. Outputs are served from static paths with signed URL enforcement controls. Quotas and rate limiting are implemented for public/customer traffic, with production validation that enforces stronger security settings (signed outputs, internal IP allowlists, and hardened H2I SSRF posture). Usage billing counters (calls/files/bytes) are incremented only on successful requests; error requests still persist `request_log` rows with `status=error` plus `error_code`/`error_message` for auditability. See the docs index for complete endpoint contracts and environment behavior.

## Features

- HTML → image/PDF rendering via Puppeteer (`/v1/h2i`).
- Image processing APIs (`/v1/image`) for conversion and edit workflows.
- PDF workflows (`/v1/pdf`) including actions that depend on `qpdf` and `pdftoppm`.
- Utility tools endpoints (`/v1/tools`).
- API key auth, internal bridge auth, and admin API/session flows.
- Signed output URL protection for generated files.
- Daily limits + burst limiting + timeout/upload constraints.
- Production smoke script for dependency/env/API checks.

---

## Quickstart (Local)

### Requirements

- **Node.js:** `22.x`.
- **Database:** MySQL (`DB_HOST`, `DB_USER`, `DB_PASS`, `DB_NAME`).
- **System binaries:**
  - `qpdf`
  - `pdftoppm` (usually from `poppler-utils`)
- **Puppeteer runtime:** Chromium available via Puppeteer defaults or `PUPPETEER_EXECUTABLE_PATH`.

### Install + run

```bash
cd Davix-pixlab-app
npm ci
cp .env.example .env  # if you maintain one locally
npm start
```

### Minimal `.env` example

> Use placeholder values only. Never commit real secrets.

```dotenv
# Core
NODE_ENV=development
PORT=3005

# Required by validateEnv() in all environments
ADMIN_PASS=TODO_admin_path_secret
ADMIN_PASSWORD_HASH=TODO_bcrypt_or_argon_hash
ADMIN_TOTP_SECRET=TODO_totp_secret
ADMIN_SESSION_SECRET=TODO_long_random_secret
SUBSCRIPTION_BRIDGE_TOKEN=TODO_internal_bridge_token

# DB
DB_HOST=127.0.0.1
DB_USER=TODO_db_user
DB_PASS=TODO_db_password
DB_NAME=pixlab

# API auth
API_KEYS=TODO_owner_or_test_key

# Signed outputs
REQUIRE_SIGNED_OUTPUT_URLS=true
SIGNED_URL_SECRET=TODO_signed_url_secret
SIGNED_URL_TTL_SECONDS=900

# Upload safety caps
GLOBAL_MAX_UPLOAD_MB=10

# Public/internal URL and allowlist posture
PUBLIC_BASE_URL=https://h2i.davix.dev
INTERNAL_ALLOWED_IPS=127.0.0.1/32

# H2I security posture
H2I_BLOCK_PRIVATE_NETWORK=true
H2I_ALLOW_FILE_SCHEME=false
H2I_DNS_REBINDING_MODE=strict
PUPPETEER_NO_SANDBOX=false
```

### Smoke check

```bash
cd Davix-pixlab-app
BASE_URL=http://127.0.0.1:3005 API_KEYS=your_key npm run verify-schema
npm run verify:prod
node scripts/prod-smoke.js
```

---

## Production deployment

### Deployment checklist

- Set `NODE_ENV=production` and ensure startup env validation passes.
- Configure required prod envs (`API_KEYS`, DB vars, `PUBLIC_BASE_URL`, internal allowlist).
- Enforce signed outputs (`REQUIRE_SIGNED_OUTPUT_URLS=true`) and provide signing secrets.
- Ensure `qpdf` and `pdftoppm` are installed on runtime hosts.
- Keep internal bridge token secret and restricted (`x-davix-bridge-token`).
- Run `node scripts/prod-smoke.js` against the deployed service.

### Security notes

- **Signed URLs:** production validation rejects unsafe signed-output config.
- **H2I SSRF controls:** production validation enforces private-network blocking, file-scheme restrictions, and strict/pin DNS rebinding mode.
- **Sandbox posture:** production validation fails when `PUPPETEER_NO_SANDBOX=true`.
- **Internal endpoints:** production requires non-empty `INTERNAL_ALLOWED_IPS`.

---

## API usage (short)

External API auth accepts:

- `X-Api-Key: <key>`
- `Authorization: Bearer <key>`

Internal APIs under `/internal/*` require:

- `x-davix-bridge-token: <token>`

For endpoint-by-endpoint request/response details, use the docs inventory:

- [`Davix-pixlab-app/docs/01-endpoints-inventory.md`](./Davix-pixlab-app/docs/01-endpoints-inventory.md)
- [`Davix-pixlab-app/docs/05-api-reference-external-v1.md`](./Davix-pixlab-app/docs/05-api-reference-external-v1.md)
- [`Davix-pixlab-app/docs/06-api-reference-internal.md`](./Davix-pixlab-app/docs/06-api-reference-internal.md)

---

## Documentation index

All docs are under [`/Davix-pixlab-app/docs`](./Davix-pixlab-app/docs).

| Document | Description |
|---|---|
| [`01-endpoints-inventory.md`](./Davix-pixlab-app/docs/01-endpoints-inventory.md) | Route inventory across external, internal, and admin surfaces. |
| [`02-env-catalog.md`](./Davix-pixlab-app/docs/02-env-catalog.md) | Condensed environment-variable catalog. |
| [`03-dependencies-and-requirements.md`](./Davix-pixlab-app/docs/03-dependencies-and-requirements.md) | Runtime/system dependencies and startup dependency checks. |
| [`04-authentication-and-api-key-usage.md`](./Davix-pixlab-app/docs/04-authentication-and-api-key-usage.md) | Authentication model and API key usage rules. |
| [`05-api-reference-external-v1.md`](./Davix-pixlab-app/docs/05-api-reference-external-v1.md) | External `/v1/*` API reference. |
| [`06-api-reference-internal.md`](./Davix-pixlab-app/docs/06-api-reference-internal.md) | Internal `/internal/*` API reference. |
| [`07-admin-api-reference.md`](./Davix-pixlab-app/docs/07-admin-api-reference.md) | Admin API behavior and session/CSRF details. |
| [`08-curl-examples-all.md`](./Davix-pixlab-app/docs/08-curl-examples-all.md) | Combined cURL examples for common flows. |
| [`09-curl-examples-internal.md`](./Davix-pixlab-app/docs/09-curl-examples-internal.md) | Internal-only cURL examples. |
| [`10-error-architecture.md`](./Davix-pixlab-app/docs/10-error-architecture.md) | Error envelope and normalization behavior. |
| [`11-limits-and-quotas.md`](./Davix-pixlab-app/docs/11-limits-and-quotas.md) | Quotas, rate limits, file limits, and timeout policy. |
| [`12-architecture-and-lifecycle.md`](./Davix-pixlab-app/docs/12-architecture-and-lifecycle.md) | Startup flow and request lifecycle architecture. |
| [`13-database-schema-and-model.md`](./Davix-pixlab-app/docs/13-database-schema-and-model.md) | MySQL schema and data model inventory. |
| [`14-api-key-and-subscription-lifecycle.md`](./Davix-pixlab-app/docs/14-api-key-and-subscription-lifecycle.md) | API key and subscription lifecycle details. |
| [`15-curl-examples-external-v1.md`](./Davix-pixlab-app/docs/15-curl-examples-external-v1.md) | External-focused cURL examples. |
| [`16-env-reference.md`](./Davix-pixlab-app/docs/16-env-reference.md) | Exhaustive environment variable reference (SSOT). |
| [`DEPLOY-PLESK.md`](./Davix-pixlab-app/docs/DEPLOY-PLESK.md) | Manual production deployment runbook for Plesk. |

---

## Getting API keys / SaaS info

Repository code exposes env-driven metadata (`WEBSITE_URL`, `SUPPORT_URL`, `SUPPORT_EMAIL`) but does not include confirmed public SaaS URLs.

- Website: **TODO: Insert official URL**
- Pricing: **TODO: Insert official URL**
- Dashboard: **TODO: Insert official URL**
- Support email: **TODO: Insert official URL/email**
- Status page: **TODO: Insert official URL**

---

## Support & Security

- Security reports: **TODO: Insert official security contact process**.
- Operational support: **TODO: Insert official support URL/email**.
- Logs include redaction utilities in code; still treat API keys/tokens as sensitive and rotate secrets immediately if exposure is suspected.

---

## License

This repository is currently licensed as **Proprietary / All Rights Reserved**. See [`LICENSE`](./LICENSE).

> Commercial product note: use/redistribution requires a commercial agreement from the rights holder.

## Contributing

- Install dependencies and run locally from `Davix-pixlab-app/`.
- Apply DB migrations as needed:
  ```bash
  cd Davix-pixlab-app
  npm run migrate
  ```
- Validate a running instance with the smoke script:
  ```bash
  node scripts/prod-smoke.js
  ```
