# Storage

- Generated assets saved under `public/` subfolders: `h2i/`, `img-edit/`, `pdf/`, `tools/`.
- Folders are created on startup and served via Express static middleware.
- URLs are `BASE_URL/<folder>/<filename>` and now include signed query parameters by default.
- Daily cleanup removes files older than 24h; additional orphan/retention cleaners run when enabled.

## Signed output URLs

PixLab signs output URLs with `exp` and `sig` query params. Defaults:
- TTL is 24 hours (`SIGNED_URL_TTL_SECONDS=86400`).
- Signature is `HMAC_SHA256(path|exp)` using `SIGNED_URL_SECRET`.
- In production, signatures are enforced on `/h2i`, `/img-edit`, and `/pdf` unless `REQUIRE_SIGNED_OUTPUT_URLS=0`.
- `OUTPUT_CACHE_CONTROL` defaults to `private, no-store` to discourage CDN caching.

Unsigned URLs still use the same paths, but will return 403 when signatures are required.
