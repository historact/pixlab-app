# API Keys

- **Owner keys**: Supplied via `API_KEYS`; unlimited usage and longer timeouts.
- **Public keys**: Keys also present in `PUBLIC_API_KEYS`; subject to shorter timeouts and stricter limits per endpoint.
- **Customer keys**: Looked up in the database via `utils/customerKeys.js` using hashed prefixes; enforce monthly quotas and validity windows.
- **Lookup order**: static owner/public list is checked first; if not found, the plaintext is resolved against `api_keys` via prefix/hash match.
- **Headers/query**: Accepts `X-Api-Key` header, `?key=` query, or `api_key` field.
- **Bridge token**: Internal routes require `X-Davix-Bridge-Token` matching `SUBSCRIPTION_BRIDGE_TOKEN`.
- **Validity**: Customer keys respect `valid_from`/`valid_until`; errors return `key_expired` or `invalid_api_key` accordingly.
