# 11) API Reference — External `/v1/*`

All `/v1/*` routes are `POST` and require API key auth (see doc 10).

## `/v1/h2i`

### Actions
- `image`
- `pdf`

### Aliases
- **None** (invalid action returns `invalid_parameter`).

### Parameters

| Field | Location | Type / accepted forms | Required | Default | Validation / clamp | Notes |
|---|---|---:|---|---|---|---|
| `action` | json or urlencoded body | string: `image`/`pdf` | yes | - | must be one of allowed actions | - |
| `html` | json or urlencoded body | string | yes | - | max chars: `GLOBAL_MAX_HTML_CHARS` (default 100000) | missing -> `missing_field` |
| `css` | json or urlencoded body | string | no | empty | contributes to bytes/accounting | injected into `<style>` wrapper |
| `width` | body | integer-ish | no | 1000 | clamped 1..`GLOBAL_MAX_RENDER_WIDTH` | - |
| `height` | body | integer-ish | no | 1500 | clamped 1..`GLOBAL_MAX_RENDER_HEIGHT` | - |
| `format` | body | string | conditional (`image`) | `png` | `jpeg` yields JPEG screenshot; other values become PNG | only used for image mode |
| `pdfFormat` | body | string | no | `A4` | only `LETTER` maps to `Letter`; else `A4` | PDF mode only |
| `pdfLandscape` | body | boolean or `'true'/'false'` | no | false | parser is strict true-string/boolean | PDF mode only |
| `pdfMargin` | body | integer-ish | no | 24 | parsed int; no clamp | PDF mode only |
| `preferCSSPageSize` | body | boolean-like | no | true | strict parseBoolean | PDF mode only |
| `scale` | body | float-ish | no | 1 | parsed float | PDF mode only |
| `printMode` | body | boolean-like | no | false | print media emulation toggle | PDF mode only |
| `printBackground` | body | boolean-like | no | true | strict parseBoolean | PDF mode only |

### Success output
- `200`: `{ url, request_id? }`
- `url` is signed via `buildSignedUrl(baseUrl, '/h2i/<file>')`.

### Errors seen in route/middleware
`invalid_parameter`, `missing_field`, `html_too_large`, `render_size_exceeded`, `rate_limit_exceeded`, `rate_limit_store_unavailable`, `monthly_quota_exceeded`, `server_busy`, `timeout`, `html_render_failed`, plus auth/idempotency errors.

---

## `/v1/image`

### Actions
`format`, `resize`, `crop`, `transform`, `compress`, `enhance`, `padding`, `frame`, `background`, `watermark`, `pdf`, `metadata`, `multitask`

### Aliases
- **None** at action level.
- `format=jpg` is normalized to `jpeg`.

### Parameters (multipart/form-data)

| Field | Location | Type | Required | Default | Validation / clamp | Notes |
|---|---|---:|---|---|---|---|
| `action` | form field | enum action string | yes | - | in allowed set | - |
| `images` | file field | image files | yes | - | mime must be in `allowedImageMimes`; upload limit middleware applies | multi-file supported |
| `watermarkImage` | file field | image file | no | - | single file | used if action needs image watermark |
| `format` | form | output fmt | no | source fmt | normalized `jpg`->`jpeg` | |
| `width`,`height` | form | int-ish | no | null | resize inside-fit | |
| `enlarge` | form | boolean-like | no | false | controls `withoutEnlargement` | |
| `cropX`,`cropY`,`cropWidth`,`cropHeight` | form | int-ish | no | - | crop only if all parse finite | |
| `rotate`,`flipH`,`flipV` | form | int/bool-like | no | - | rotate only if finite | |
| `targetSizeKB`,`quality` | form | int-ish | no | - | quality search/clamps in encoder path | |
| `keepMetadata` | form | bool-like | no | false | - | |
| `normalizeOrientation` | form | bool-like | no | false | - | |
| `blur`,`sharpen`,`grayscale`,`sepia` | form | num/bool-like | no | - | blur 0..500, sharpen 0..10 | |
| `brightness`,`contrast`,`saturation` | form | number-ish | no | 1 | clamped 0..2 | |
| `pad`,`padTop`,`padRight`,`padBottom`,`padLeft`,`padColor` | form | int/string | no | 0 / `#ffffff` | non-finite ignored | |
| `border`,`borderColor`,`borderRadius` | form | int/string | no | 0 / `#000` | min 0 | |
| `backgroundColor`,`backgroundBlur` | form | string/num | no | - | backgroundBlur clamp 0..200 | |
| `watermarkText`,`watermarkFontSize`,`watermarkColor`,`watermarkOpacity`,`watermarkPosition`,`watermarkMargin`,`watermarkScale` | form | text/number | no | route defaults | opacity clamp 0..1 | |
| `pdfMode`,`pdfPageSize`,`pdfOrientation`,`pdfMargin`,`pdfEmbedFormat`,`pdfJpegQuality` | form | mixed | conditional when output `pdf` | defaults in route | `pdfJpegQuality` clamp 20..100 | |
| `colorSpace` | form | `srgb`/`grayscale`/`cmyk` | no | `srgb` | `cmyk` may fail build -> `invalid_parameter` | |
| `includeRawExif` | form | bool-like | no | false | - | used by metadata action |

### Accepted but effectively ignored
- For most non-`metadata` actions, route runs a shared pipeline; action label mostly affects logging/conventions, not branching.

### Success output
- `metadata`: `{ results: [{ originalName, metadata: {...}}], request_id? }`
- other actions: `{ results: [{ url, format, sizeBytes, width, height, quality, originalName }], request_id? }`
- URLs signed under `/image/<file>`.

### Errors
`invalid_parameter`, `missing_field`, `unsupported_media_type`, `invalid_upload`, `rate_limit_exceeded`, `rate_limit_store_unavailable`, `monthly_quota_exceeded`, `server_busy`, `timeout`, `image_processing_failed`, plus auth/idempotency errors.

---

## `/v1/pdf`

### Actions
`merge`, `to-images`, `compress`, `extract-images`, `watermark`, `rotate`, `metadata`, `reorder`, `delete-pages`, `extract`, `flatten`, `encrypt`, `decrypt`, `split`

### Aliases
- None.

### Parameters (multipart/form-data)
- File upload middleware accepts PDF uploads and one optional `watermarkImage` image.
- For non-`merge` actions, route expects the first PDF file as primary input.

| Field | Location | Type | Required | Default | Validation / clamp | Action notes |
|---|---|---:|---|---|---|---|
| `action` | form | enum | yes | - | must match supported list | all |
| `files` / uploaded PDFs | file field | pdf file(s) | yes | - | mimetype in allowed PDF mimes | merge/multi ops |
| `sortByName` | form | bool-like | no | false | `toLowerCase()==='true'` | merge |
| `pages` | form | `'all'`, `'first'`, CSV ranges | conditional | `'all'` | parsed/clamped to page count | to-images/extract-images/watermark/rotate/delete-pages/extract |
| `format` | form | image format | no | `png` | action helper controls | to-images |
| `quality`,`density` | form | int-ish | no | action defaults | clamped in helper | to-images/extract-images |
| `watermarkText`,`opacity`,`position`,`fontSize`,`color`,`x`,`y` | form | mixed | conditional | defaults in helper | parsed numerically where needed | watermark |
| `degrees` | form | int-ish | conditional rotate | - | finite parse required | rotate |
| `order` | form | CSV page order | yes for reorder | - | must parse valid indexes | reorder |
| `password` | form | string | required for decrypt | - | non-empty | decrypt |
| `userPassword`,`ownerPassword` | form | string | required userPassword for encrypt | owner defaults to user | qpdf must exist | encrypt |
| `ranges` | form | CSV ranges like `1-3,4-5` | required split | - | parsed pairs only | split |
| `prefix` | form | string | no | `split_` | no clamp | split |

### Success output patterns
- Single output: `{ url, ...metadata }`
- Multi output: `{ results: [{ url, ... }] }`
- URLs signed under `/pdf/<file>`.

### Errors
`missing_field`, `invalid_parameter`, `unsupported_media_type`, `pdf_page_limit_exceeded`, `rate_limit_exceeded`, `rate_limit_store_unavailable`, `monthly_quota_exceeded`, `server_busy`, `timeout`, `pdf_tool_failed`, plus auth/idempotency errors.

---

## `/v1/tools`

### Actions
- `single`
- `multitask`

### Tool names (from `tools` list)
`metadata`, `colors`, `detect-format`, `orientation`, `hash`, `similarity`, `dimensions`, `quality`, `transparency`, `efficiency`

### Aliases
- Tool list may be provided through `tools` or `tools[]` body field; route parses comma-separated text.

### Parameters (multipart/form-data)

| Field | Location | Type | Required | Default | Validation / clamp | Notes |
|---|---|---:|---|---|---|---|
| `action` | form | `single`/`multitask` | yes | - | action=single requires exactly one tool | |
| `images` | file field | image file(s) | yes | - | mime validated by upload filter | |
| `tools` / `tools[]` | form | comma-separated string | yes | - | parsed to lowercase list | empty -> `invalid_parameter` |
| `includeRawExif` | form | `'true'` enables raw exif | no | false | strict `'true'` check | metadata |
| `paletteSize` | form | int-ish | no | 5 | clamp 1..16 | colors |
| `hashType` | form | `phash`/`md5`/`sha1`/`sha256` | no | `phash` | unknown falls back to `phash` | hash |
| `qualitySample` | form | int-ish | no | 256 | clamp 64..512 | quality |
| `transparencySample` | form | int-ish | no | 64 | clamp 16..128 | transparency |
| `similarityMode` | form | `pairs`/`tofirst` | no | `pairs` | other values -> `pairs` | similarity |
| `similarityThreshold` | form | int-ish | no | 8 | clamp 0..64 | similarity |
| `efficiencyFormat`,`efficiencyQuality` | form | string/int-ish | no | null | helper-estimate path | efficiency |

### Success output
- `{ results: [{ originalName, sizeBytes, tools: {...}}], request_id? }`
- Similarity can add top-level or per-result similarity structures depending on mode.

### Errors
`invalid_parameter`, `missing_field`, `unsupported_media_type`, `invalid_upload`, `rate_limit_exceeded`, `rate_limit_store_unavailable`, `monthly_quota_exceeded`, `server_busy`, `timeout`, `tool_processing_failed`, plus auth/idempotency errors.

## Known unknowns
- **(D)** exact serialized shape of some helper-generated tool payloads and PDF action metadata fields may vary by library output (`sharp`, `pdf-lib`, `qpdf`) and installed binaries.
