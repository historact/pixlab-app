# POST /v1/pdf

- **Purpose**: PDF utilities including merge, split, compress, convert to images, and extract images.
- **Auth**: API key required.
- **Limits**: Public keys max 10 files and 10 MB per request; per-IP daily cap of 10 files. Timeout shorter for public keys.
- **Quota**: Customer keys consume number of files uploaded (default 1).

## Request
Multipart with `files` or `file`. Body fields:
- `action` (required) one of `to-images`, `merge`, `split`, `compress`, `extract-images`.
- `pages` (for to-images/extract-images, supports list/ranges or `all`/`first`).
- `toFormat` (image format for to-images), `width`, `height`, `dpi`.
- `sortByName` (bool) for merge ordering.
- `ranges` (required for split, e.g., `1-3,4-5`).
- `prefix` for split output names.
- `imageFormat` for extract-images.

## Response
Varies by action: merged/compressed/split returns `url` and size metadata; conversions return `results` array with URLs and page info.

## Errors
`missing_field`, `monthly_quota_exceeded`, `too_many_files`, `payload_too_large`, `rate_limit_exceeded`, `pdf_tool_failed`, `invalid_parameter`, `invalid_api_key`.
