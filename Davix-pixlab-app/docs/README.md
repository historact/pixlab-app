# PixLab Docs Index

## Canonical references
- **Environment variables (single source of truth):** [61 - Environment Variable Reference (Exhaustive)](./61-env-reference.md)
- **Route surface and access model:** [01 - Endpoints Inventory](./01-endpoints-inventory.md)
- **Runtime/system requirements:** [03 - Dependencies and Runtime Requirements](./03-dependencies-and-requirements.md)

## Full documentation map
- [01 - Endpoints Inventory](./01-endpoints-inventory.md) — current HTTP route matrix (external/internal/admin), auth, and static output fetch paths.
- [02 - ENV Catalog](./02-env-catalog.md) — compact ENV catalog and validation overview (secondary to 61).
- [03 - Dependencies and Runtime Requirements](./03-dependencies-and-requirements.md) — Node/system dependencies and startup dependency checks.
- [10 - Authentication and API Key Usage](./10-authentication-and-api-key-usage.md) — auth flows for external, internal, and admin APIs.
- [11 - API Reference (External `/v1/*`)](./11-api-reference-external-v1.md) — external endpoint contracts.
- [12 - API Reference (Internal `/internal/*`)](./12-api-reference-internal.md) — internal bridge/admin-ops endpoint contracts.
- [13 - Admin API Reference](./13-admin-api-reference.md) — admin panel API contracts and session/CSRF behavior.
- [14 - cURL Examples (All)](./14-curl-examples-all.md) — all-user cURL example set.
- [15 - cURL Examples (Internal `/internal/*`)](./15-curl-examples-internal.md) — internal-only cURL examples.
- [20 - Error Architecture](./20-error-architecture.md) — error envelope rules and normalization behavior.
- [30 - Limits and Quotas](./30-limits-and-quotas.md) — timeout, rate, upload, quota, and concurrency limits.
- [40 - Architecture and Request Lifecycle](./40-architecture-and-lifecycle.md) — startup sequence and request lifecycle.
- [50 - Database Schema and Data Model](./50-database-schema-and-model.md) — schema, migrations, and model inventory.
- [60 - API Key & Subscription Lifecycle](./60-api-key-and-subscription-lifecycle.md) — key lifecycle and subscription sync.
- [61 - cURL Examples (External `/v1/*`)](./61-curl-examples-external-v1.md) — external v1 focused cURL examples.
- [61 - Environment Variable Reference (Exhaustive)](./61-env-reference.md) — exhaustive ENV-by-ENV behavior reference.

## Documentation changelog
- 2026-02-27: added docs index map coverage for all docs pages and elevated ENV SSOT link.
- 2026-02-27: extended `61-env-reference.md` with missing retention, orphan-cleanup, per-folder file cleanup, and monitoring snapshot env keys.
- 2026-02-27: clarified startup dependency checks and minimal install guidance for `qpdf` + `pdftoppm`.
