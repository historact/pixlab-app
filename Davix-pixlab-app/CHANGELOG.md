# Changelog

## Unreleased
- Added signed output URLs with configurable TTL, cache-control, and enforcement for `/h2i`, `/img-edit`, and `/pdf`.
- Added MySQL-backed daily rate limits and optional customer burst throttling.
- Added SSRF protections and configurable Puppeteer sandbox flags for HTML rendering.
- Added production env validation, trust proxy configuration, and global upload ceilings.

### New/updated environment variables
- TRUST_PROXY
- DISABLE_QUERY_API_KEY_IN_PROD
- REQUIRE_SIGNED_OUTPUT_URLS
- SIGNED_URL_SECRET
- SIGNED_URL_TTL_SECONDS
- SIGNED_URL_ALGO
- OUTPUT_CACHE_CONTROL
- GLOBAL_MAX_TOTAL_UPLOAD_MB
- GLOBAL_MAX_FILES_PER_REQ
- CUSTOMER_BURST_LIMIT_PER_MIN
- CUSTOMER_BURST_WINDOW_SECONDS
- H2I_BLOCK_PRIVATE_NETWORK
- H2I_ALLOW_FILE_SCHEME
- PUPPETEER_NO_SANDBOX
- RETENTION_RATE_LIMIT_DAYS
