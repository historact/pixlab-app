# API Keys

- **Owner keys**: Supplied via `API_KEYS`; unlimited usage and longer timeouts.
- **Public keys**: Keys also present in `PUBLIC_API_KEYS`; subject to shorter timeouts and stricter limits per endpoint.
- **Customer keys**: Looked up in the database via `utils/customerKeys.js` using hashed prefixes; enforce monthly quotas and validity windows.
- **Lookup order**: static owner/public list is checked first; if not found, the plaintext is resolved against `api_keys` via prefix/hash match.
- **Headers/body**: Recommended auth uses `X-Api-Key` or `Authorization: Bearer <key>`. The `api_key` body field remains supported for compatibility.
- **Query string**: `?key=` is dev-only and disabled in production by default (`DISABLE_QUERY_API_KEY_IN_PROD=1`).
- **Bridge token**: Internal routes require `X-Davix-Bridge-Token` matching `SUBSCRIPTION_BRIDGE_TOKEN`.
- **Validity**: Customer keys respect `valid_from`/`valid_until`; errors return `key_expired` or `invalid_api_key` accordingly.
- **Public per-IP limits (env overrides)**: Default public daily caps are 5 (`PUBLIC_H2I_DAILY_LIMIT` for `/v1/h2i`) and 10 per IP/day for `/v1/image` (`PUBLIC_IMAGE_DAILY_LIMIT`), `/v1/pdf` (`PUBLIC_PDF_DAILY_LIMIT`), and `/v1/tools` (`PUBLIC_TOOLS_DAILY_LIMIT`). Set the env vars to positive integers to customize; owner keys remain unlimited and customer keys use monthly quotas.
