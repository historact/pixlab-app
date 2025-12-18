# POST /v1/tools

- **Purpose**: Analyze images for metadata, colors, format detection, orientation, and hashing.
- **Auth**: API key required.
- **Limits**: Up to 50 files; public keys max 10 files, 10 MB total, dimensions scaled down to 6000px, daily per-IP 10 files.
- **Quota**: Customer keys consume `max(files,1)`.

## Request
Multipart with `images`. Body fields:
- `tools` (comma list; default `metadata`)
- `includeRawExif` (bool)
- `paletteSize` (int, default 5)
- `hashType` (phash|md5|sha1)

## Response
`{ "results": [ { originalName, tools: { metadata, colors, detect-format, orientation, hash } } ] }`

## Errors
`missing_field`, `monthly_quota_exceeded`, `too_many_files`, `payload_too_large`, `rate_limit_exceeded`, `tool_processing_failed`, `invalid_api_key`.
