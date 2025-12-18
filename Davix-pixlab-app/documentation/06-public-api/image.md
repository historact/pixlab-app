# POST /v1/image

- **Purpose**: Transform uploaded images (resize, crop, rotate, format change) and optionally export to PDF.
- **Auth**: API key required.
- **Limits**: Max 50 files overall; public keys max 10 files and 10 MB total, dimensions capped at 6000px; daily per-IP limit 10 files.
- **Quota**: Customer keys consume `max(files,1)`.

## Request
Multipart form with `images` files. Body fields:
- `format` (jpg|png|webp|avif|gif|svg|pdf)
- `width`, `height` (ints)
- `enlarge` (bool)
- `cropX`, `cropY`, `cropWidth`, `cropHeight` (ints)
- `rotate` (int degrees)
- `flipH`, `flipV` (bool)
- `targetSizeKB` (int)
- `quality` (int)
- `keepMetadata` (bool)
- `pdfMode` (single|multi when format=pdf)
- `pdfPageSize` (auto|a4|letter)
- `pdfOrientation` (portrait|landscape)
- `pdfMargin` (int)
- `pdfEmbedFormat` (png|jpeg)
- `pdfJpegQuality` (20-100)

## Response
`{ "results": [ { url, format, sizeBytes, width, height, quality, originalName } ] }`

## Errors
`missing_field`, `monthly_quota_exceeded`, `too_many_files`, `payload_too_large`, `rate_limit_exceeded`, `image_processing_failed`, `invalid_api_key`.
