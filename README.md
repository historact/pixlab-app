# PixLab

> Production-ready Node/Express API engine for HTML-to-image/PDF rendering, image processing, PDF tooling, and utility tools.

![Node 22.x](https://img.shields.io/badge/node-22.x-339933?logo=node.js&logoColor=white)

## What PixLab does
PixLab exposes API endpoints for:
- **H2I rendering** (`/v1/h2i`): HTML/CSS to image or PDF via Puppeteer.
- **Image operations** (`/v1/image`): format conversion, resize/crop/transform, watermarking, metadata, and multitask pipelines.
- **PDF operations** (`/v1/pdf`): conversion, split/merge, extraction, watermarking, encryption/decryption (with `qpdf`).
- **Tools operations** (`/v1/tools`): utility transforms and analysis workflows.

Code is in [`Davix-pixlab-app/`](./Davix-pixlab-app).

## Quickstart
### Prerequisites
- Node.js **22.x**
- MySQL database reachable by `DB_HOST/DB_USER/DB_PASS/DB_NAME`
- System binaries:
  - `qpdf`
  - `pdftoppm` (typically from poppler-utils)

### Minimal setup
1. Install dependencies:
   ```bash
   cd Davix-pixlab-app
   npm install
   ```
2. Configure environment variables (required + production values):
   - See canonical reference: [`docs/61-env-reference.md`](./Davix-pixlab-app/docs/61-env-reference.md)
3. Start server:
   ```bash
   npm start
   ```
4. Run production smoke checks:
   ```bash
   node scripts/prod-smoke.js
   ```

## Security highlights
- **Signed output URLs**: production requires `REQUIRE_SIGNED_OUTPUT_URLS=true`; static output fetches are signature/expiry-guarded.
- **Internal bridge hardening**: `/internal/*` requires `x-davix-bridge-token`; production also requires non-empty `INTERNAL_ALLOWED_IPS`.
- **H2I SSRF protections**: production validation enforces private-network blocking, `file://` restrictions, and DNS rebinding mode (`strict`/`pin`).
- **Puppeteer sandbox posture**: production validation fails if `PUPPETEER_NO_SANDBOX=true`.

## Documentation map
- [`Davix-pixlab-app/docs/README.md`](./Davix-pixlab-app/docs/README.md) — docs index.
- [`01-endpoints-inventory.md`](./Davix-pixlab-app/docs/01-endpoints-inventory.md) — endpoint/auth/static path inventory.
- [`03-dependencies-and-requirements.md`](./Davix-pixlab-app/docs/03-dependencies-and-requirements.md) — runtime and system dependencies.
- [`61-env-reference.md`](./Davix-pixlab-app/docs/61-env-reference.md) — **canonical env reference (SSOT)**.
- [`30-limits-and-quotas.md`](./Davix-pixlab-app/docs/30-limits-and-quotas.md) — quotas/rate limits/concurrency.
- [`40-architecture-and-lifecycle.md`](./Davix-pixlab-app/docs/40-architecture-and-lifecycle.md) — startup and request lifecycle.

## Branding / ownership
- The codebase and docs identify this engine as **PixLab**.
- Repository metadata and defaults include **Davix** naming (`davix-pixlab`, `h2i.davix.dev` defaults in selected env fallbacks).
- No additional ownership claims are made beyond what is present in this repository.

## Get API keys / Pricing / Support
Repository code exposes operator-configurable support metadata via env (`WEBSITE_URL`, `SUPPORT_URL`, `SUPPORT_EMAIL`), but does not include an official public pricing/support portal URL in committed config.

- Website: **(set your URL)**
- Pricing: **(set your URL)**
- Support: **(set your URL)**

## Production checklist (before go-live)
- [ ] `NODE_ENV=production` and env validation passes on startup.
- [ ] `SUBSCRIPTION_BRIDGE_TOKEN`, `INTERNAL_ALLOWED_IPS`, and admin secrets are set.
- [ ] Signed URL config is complete (`REQUIRE_SIGNED_OUTPUT_URLS`, `SIGNED_URL_SECRET`, `SIGNED_URL_TTL_SECONDS`).
- [ ] `qpdf` and `pdftoppm` installed and available in PATH.
- [ ] `node scripts/prod-smoke.js` passes.
- [ ] Disk + DB retention/cleanup knobs reviewed (`*_RETENTION_*`, `*_CLEANUP_*`).
- [ ] Monitoring snapshot retention and alert retention values are set for your capacity.
