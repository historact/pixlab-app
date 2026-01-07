# Environment variables

This file documents production-relevant environment toggles. Defaults are shown when omitted.

## Security & hardening

- `PUPPETEER_NO_SANDBOX` (`true` in non-production, `false` in production): when `true`, Chromium is launched with `--no-sandbox` and `--disable-setuid-sandbox`.
- `H2I_DNS_REBINDING_MODE` (default: `strict` in production when `H2I_BLOCK_PRIVATE_NETWORK=true`, otherwise `off`):
  controls DNS rebinding mitigation for `/v1/h2i`.
  - `off`: resolve once per host (cached) and only block private/metadata IPs.
  - `strict`: re-resolve on each request and block private/metadata IPs.
  - `pin`: pin first resolution per host and block on change.
  - Example defaults:
    - `NODE_ENV=production` + `H2I_BLOCK_PRIVATE_NETWORK=true` -> `strict`
    - `NODE_ENV=production` + `H2I_BLOCK_PRIVATE_NETWORK=false` -> `off`
    - `NODE_ENV=development` -> `off`
  - Compatibility note: `strict` or `pin` may block some external assets if DNS changes between requests.
- `H2I_BLOCK_PRIVATE_NETWORK` (`true`): block private/localhost network access during H2I render.
- `H2I_ALLOW_FILE_SCHEME` (`false`): allow `file:` URLs during H2I render.
- `REQUIRE_SIGNED_OUTPUT_URLS` (`true` in production, `false` otherwise): enforce signed static URLs.

## Rate limiting & burst control

- `RATE_LIMIT_DB_FAILURE_MODE` (`memory`): behavior when the DB-backed daily limiter fails.
  - `memory`: fallback to per-process in-memory counters.
  - `open`: allow the request without tracking.
  - `closed`: reject with `503 rate_limit_store_unavailable`.
- `CUSTOMER_BURST_LIMIT_PER_MIN` (`0`): enable burst limiter for customer keys when > 0.
- `CUSTOMER_BURST_WINDOW_SECONDS` (`60`): window size for burst counting.
- `CUSTOMER_BURST_APPLIES_TO` (`h2i`): scope for burst limiter (`h2i` or `all`).

## Migrations

- `AUTO_RUN_MIGRATIONS` (`false`): when `true`, runs SQL migrations on startup before listening.
