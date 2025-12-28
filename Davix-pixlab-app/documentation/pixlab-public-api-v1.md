# PixLab Public API (v1) — Code-Verified Documentation

## 0) Global behavior (applies to all endpoints)
### 0.1 Authentication
- **Accepted API key locations (checked in order):** `?key` query param, `X-Api-Key` header (case-insensitive), or `api_key` in the body. The first present value is used. (Source: `server.js` lines 216-257)
- **Key types:**
  - **Owner keys** (present in `API_KEYS` but not `PUBLIC_API_KEYS`).
  - **Public keys** (present in both `API_KEYS` and `PUBLIC_API_KEYS`).
  - **Customer keys** (validated via `findCustomerKeyByPlaintext`, including plan metadata and validity windows). (Source: `server.js` lines 206-241; `utils/customerKeys.js`)
- **Endpoint allowance:** Customer plans may block endpoints via `allow_h2i|allow_image|allow_pdf|allow_tools`; blocked requests receive `403 endpoint_not_allowed`. (Source: `utils/limits.js` lines 67-191)

### 0.2 Standard error envelope
- All `sendError` responses follow:
  ```json
  {
    "status": "error",
    "code": "<string>",
    "message": "<string>",
    "error": {
      "code": "<string>",
      "message": "<string>",
      "hint": "<string?>",
      "details": "<any?>"
    }
  }
  ```
  (Source: `utils/errorResponse.js` lines 1-21)
- Common codes: `invalid_api_key`, `key_expired`, `invalid_parameter`, `missing_field`, `unsupported_media_type`, `file_too_large`, `too_many_files`, `total_upload_exceeded`, `dimension_exceeded`, `invalid_upload`, `rate_limit_exceeded`, `timeout`, and endpoint-specific codes listed per section below.

### 0.3 Timeouts, size limits, quotas, and rate limits
- **Timeouts:** Per-endpoint middleware uses `resolveTimeoutMs(apiKeyType, plan)`.
  - Public: 30,000 ms default (`PUBLIC_TIMEOUT_MS` override).
  - Owner: 300,000 ms default (`OWNER_TIMEOUT_MS` override).
  - Customer: plan `timeout_seconds` (if present) else 300,000 ms. (Source: `utils/limits.js` lines 51-206)
- **Body parser limits:** JSON and URL-encoded bodies limited to `BODY_PARSER_JSON_LIMIT` env (default `20mb`). (Source: `server.js` lines 134-138; `utils/limits.js` lines 38-40)
- **Upload limits (multer + in-memory enforcement):**
  - Per-file size: `MAX_UPLOAD_BYTES` env else 10 MB. (Source: `utils/limits.js` lines 131-149)
  - Public defaults per endpoint: image/tools max 10 files & 10 MB total & 6000px max dimension; pdf max 10 files & 10 MB total. (Source: `utils/limits.js` lines 83-102)
  - Owner defaults: up to 50 files; no total/dimension cap unless OWNER_* envs set. (Source: `utils/limits.js` lines 104-129)
  - Customer: plan overrides (`max_files_per_request`, `max_total_upload_mb`, `max_dimension_px`) else public defaults. (Source: `utils/limits.js` lines 131-158)
  - Dimension checks run during upload; failures return `dimension_exceeded` or `invalid_upload`. (Source: `utils/uploadLimits.js` lines 117-239)
- **Per-IP daily limits (public keys only):**
  - /v1/h2i: 5 renders/day (env `PUBLIC_H2I_DAILY_LIMIT`). (Source: `routes/h2i-route.js` lines 27-59)
  - /v1/image: 10 image files/day (counts incoming files). (Source: `routes/image-route.js` lines 24-49)
  - /v1/tools: 10 files/day. (Source: `routes/tools-route.js` lines 41-63)
  - /v1/pdf: 10 PDF files/day. (Source: `routes/pdf-route.js` lines 22-49)
- **Customer monthly quota:** If plan has `monthly_quota`, each request consumes `max(uploaded_files, 1)` files (or 1 for h2i) and is blocked with HTTP 429 `monthly_quota_exceeded` when exhausted. (Sources: `routes/*` quota checks; `usage.js` lines 138-143)
- **Usage logging:** Customers only; records bytes in/out, files processed, status, and params per endpoint. (Source: `usage.js` lines 145-270)

### 0.4 Output files and hosting
- Outputs saved under `public/` subfolders and served statically:
  - `/h2i` → `public/h2i`
  - `/img-edit` → `public/img-edit`
  - `/pdf` → `public/pdf`
  - `/tools` → `public/tools`
  (Source: `server.js` lines 79-95)
- Cleanup job deletes generated files older than `PUBLIC_FILE_TTL_HOURS` (default 24h). (Source: `server.js` lines 269-307)
- Additional background cleanups (expiry/orphan/retention) run if enabled but do not change public responses. (Source: `server.js` lines 400-444)

## 1) Endpoint: POST /v1/h2i
### 1.1 Purpose & high-level flow
Converts HTML (with optional CSS) into an image or PDF via Puppeteer; saves file to `/h2i` and returns its URL. (Source: `routes/h2i-route.js` lines 63-389)

### 1.2 Content-Type and input modes supported / not supported
- **Supported:** `application/json` (parsed by body-parser). (Source: `server.js` lines 134-138)
- **Not supported:** multipart/form-data uploads; file upload is not used here.

### 1.3 Parameters (table)
| Name | Type | Required | Default | Constraints | Notes / Used in code |
| --- | --- | --- | --- | --- | --- |
| action | string | Yes | — | `image` or `pdf` | Chooses output mode. (lines 63-109)
| html | string | Yes | — | Max length 100,000 chars | Required content. (lines 90-195)
| css | string | No | — | Included inline | Injected into `<style>` before render. (lines 90-304)
| width | int | No | 1000 | 1..MAX_RENDER_WIDTH (5000) | Viewport width clamped; contributes to pixel cap. (lines 90-251)
| height | int | No | 1500 | 1..MAX_RENDER_HEIGHT (8000) | Viewport height clamped; contributes to pixel cap. (lines 90-251)
| format | string | No (image only) | `png` | `jpeg` → JPG else PNG | Only applies when action=`image`. (lines 94-285)
| pdfFormat | string | No | `A4` | `A4` or `Letter` (case-insensitive) | Applies when action=`pdf`. (lines 95-334)
| pdfLandscape | bool | No | `false` | — | Sets landscape layout. (lines 95-336)
| pdfMargin | int(px) | No | 24 | Parsed int | Uniform margin in px. (lines 97-343)
| preferCSSPageSize | bool | No | `true` | — | Passes `preferCSSPageSize` to Puppeteer. (lines 98-338)
| scale | number | No | 1 | Parsed float | Puppeteer page scale. (lines 99-339)
| printMode | bool | No | `false` | — | If true, `emulateMediaType('print')`. (lines 100-327)
| printBackground | bool | No | `true` | — | Controls background rendering. (lines 101-337)

### 1.4 Rate limits / quota / timeouts specific to this endpoint
- Public IP daily cap: 5 renders/day. (lines 27-59)
- Customer monthly quota: consumes 1 file per call. (lines 74-238)
- Timeout: resolved per key type (see Global 0.3). (server middleware)
- Render size guard: width*height must be ≤20,000,000 pixels; otherwise `render_size_exceeded` 400. (lines 248-279)

### 1.5 Response schema + example response
- Success: `{ "url": "<absolute file url>" }` (lines 367-389)
- Example: `{ "url": "https://pixlab.example/h2i/uuid.png" }`

### 1.6 Error codes specific to this endpoint
- `invalid_parameter` (missing/invalid action or output mode). (lines 63-133)
- `missing_field` when `html` absent. (lines 165-195)
- `html_too_large` when `html` exceeds 100k chars. (lines 137-163)
- `render_size_exceeded` when viewport exceeds pixel cap. (lines 251-279)
- `monthly_quota_exceeded` (customer). (lines 197-238)
- `html_render_failed` (render exception). (lines 390-418)
- `rate_limit_exceeded` (public daily). (lines 37-59)

### 1.7 “All-params” cURL example (one single example)
```bash
curl -X POST https://pixlab.davix.dev/v1/h2i \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: YOUR_KEY" \
  -d '{
    "action": "pdf",
    "html": "<h1>Hello</h1>",
    "css": "body{background:#fafafa}",
    "width": 1200,
    "height": 1800,
    "format": "png",
    "pdfFormat": "Letter",
    "pdfLandscape": true,
    "pdfMargin": 36,
    "preferCSSPageSize": true,
    "scale": 1.2,
    "printMode": true,
    "printBackground": true
  }'
```

## 2) Endpoint: POST /v1/image
### 2.1 Purpose & high-level flow
Processes one or more images via Sharp (resize/crop/transform/compress/effects), optional PDF export, metadata read, and watermarking. Saves outputs to `/img-edit`; returns URLs per file. Action is validated but most parameters are honored regardless of action (except `metadata` short-circuit). (Source: `routes/image-route.js` lines 280-938)

### 2.2 Content-Type and input modes supported / not supported
- **Supported:** `multipart/form-data` with fields:
  - `images` (one or more image files; required unless action=metadata still needs files).
  - `watermarkImage` (optional single image). (Source: `routes/image-route.js` lines 268-278)
- **Not supported:** JSON-only bodies for image content.
- Allowed MIME types: jpeg, png, webp, gif, avif, svg. (Source: `utils/limits.js` lines 42-49; `routes/image-route.js` lines 255-265)

### 2.3 Actions / Modules supported
The router accepts actions: `format`, `resize`, `crop`, `transform`, `compress`, `enhance`, `padding`, `frame`, `background`, `watermark`, `pdf`, `metadata`, `multitask`. (Source: `routes/image-route.js` lines 287-311)
- **Metadata action:** returns metadata only; other parameters are ignored for this action. (lines 425-466)
- **All other actions:** share the same processing pipeline; parameters apply based on presence, not action name.

### 2.4 Parameters by module (tables)
**Resize module (applies when width/height provided)**
| Name | Type | Required | Default | Constraints | Notes |
| --- | --- | --- | --- | --- | --- |
| width | int | No | — | Parsed int | Resize width; fit=inside. (lines 468-520)
| height | int | No | — | Parsed int | Resize height; fit=inside. (lines 468-520)
| enlarge | bool | No | `false` | Prevents enlargement when false (`withoutEnlargement`). (lines 473-519)
| format | string | No | Detected input | `jpg` normalized to `jpeg`; `pdf` triggers PDF export. (lines 468-778)

**Crop module (applies only if all four are present and numeric)**
| Name | Type | Required | Default | Constraints | Notes |
| cropX | int | Conditionally | — | Must be numeric with others | Left/top crop origin. (lines 500-513)
| cropY | int | Conditionally | — | — |  |
| cropWidth | int | Conditionally | — | — |  |
| cropHeight | int | Conditionally | — | — |  |

**Transform module**
| Name | Type | Required | Default | Constraints | Notes |
| rotate | int | No | — | Any int | Applied after resize/crop. (lines 522-525)
| flipH | bool | No | `false` | — | Horizontal flip. (lines 526-527)
| flipV | bool | No | `false` | — | Vertical flip. (lines 526-528)
| normalizeOrientation | bool | No | `false` | Uses EXIF orientation auto-rotate. (lines 495-498)

**Compression module**
| Name | Type | Required | Default | Constraints | Notes |
| targetSizeKB | int | No | — | Binary search 20-90 quality | If set, overrides quality to hit target size. (lines 783-806)
| quality | int | No | — | Parsed int | Used when format/target provided; also for AVIF/WebP/JPEG. (lines 468-812)

**Color/appearance module**
| Name | Type | Required | Default | Constraints | Notes |
| blur | number | No | — | Clamped 0-500 | `0` triggers default blur. (lines 529-534)
| sharpen | number/bool | No | — | Clamped 0-10; bool→1 |  (lines 535-539)
| grayscale | bool | No | `false` | — | (lines 541-542)
| sepia | bool | No | `false` | — | (lines 542-548)
| brightness | number | No | 1 | Clamped 0-2 | (lines 549-556)
| contrast | number | No | 1 | Clamped 0-2 | Linear adjustment. (lines 549-562)
| saturation | number | No | 1 | Clamped 0-2 | Via modulate. (lines 549-557)
| colorSpace | string | No | `srgb` | `srgb`/`grayscale`/`cmyk`; CMYK may throw `cmyk_not_supported`. (lines 476-742)
| backgroundColor | string | No | — | Hex/keyword | Used to flatten alpha or force opaque JPEG. (lines 567-582)
| backgroundBlur | number | No | — | Clamped 0-200; default 20 | Blurs background before compositing. (lines 567-579)

**Padding / border module**
| Name | Type | Required | Default | Constraints | Notes |
| pad | int | No | — | Applies to all sides | Master padding fallback. (lines 584-602)
| padTop/Right/Bottom/Left | int | No | 0 | Only used when `pad` not provided. (lines 585-602)
| padColor | string | No | `#ffffff` | — | Background for padding. (lines 594-599)
| border | int | No | 0 | ≥0 | Extends equally; uses `borderColor`. (lines 604-617)
| borderColor | string | No | `#000000` | — |  |
| borderRadius | int | No | 0 | ≥0 | Masks rounded corners; forces flatten on JPEG. (lines 619-639)

**Watermark module**
| Name | Type | Required | Default | Constraints | Notes |
| watermarkImage | file | No | — | One file | Resized relative to base (scale below). (lines 641-675)
| watermarkText | string | No | — | — | Rendered via SVG overlay. (lines 677-712)
| watermarkFontSize | int | No | 32 | 6..400 | Applies to text watermark. (lines 677-712)
| watermarkColor | string | No | `#ffffff` | — | Text color. (lines 677-712)
| watermarkOpacity | number | No | 0.35 | 0..1 | Applies to both text and image watermark. (lines 647-668, 686-692)
| watermarkPosition | string | No | `center` | `center, top-left, top, top-right, bottom-left, bottom, bottom-right, left, right` | Placement helper. (lines 641-670, 693-700)
| watermarkMargin | int | No | 24 | 0..5000 | Offset from edges. (lines 641-670, 693-700)
| watermarkScale | number | No | 0.25 | 0.01..1 | Relative size for image watermark. (lines 646-669)

**Background/flatten module**
- Uses `backgroundColor` or `backgroundBlur` when alpha exists or JPEG is requested. (lines 567-582)

**PDF export module (format=pdf)**
| Name | Type | Required | Default | Constraints | Notes |
| format | string | Yes for PDF | `pdf` | Must be `pdf` to trigger export. (lines 468-777)
| pdfMode | string | No | `single` | `single` exports one PDF per input; `multi` merges into one multi-page PDF. (lines 479-487, 831-882)
| pdfPageSize | string | No | `auto` | `auto`, `a4`, `letter` | Only used in PDF export. (lines 479-846)
| pdfOrientation | string | No | `portrait` | `portrait`/`landscape` | (lines 480-846)
| pdfMargin | int | No | 0 | Parsed int | Margin for embedding. (lines 481-487, 847-865)
| pdfEmbedFormat | string | No | `png` | `png` or `jpeg` | Controls embedded image format. (lines 483-487, 835-852)
| pdfJpegQuality | int | No | 85 | 20..100 | Applies when embedFormat=jpeg. (lines 484-487)

**Metadata module (action=metadata)**
| Name | Type | Required | Default | Notes |
| includeRawExif | bool | No | `false` | When true, returns full EXIF; otherwise trimmed fields. (lines 425-466)
| normalizeOrientation | bool | No | `false` | Only influences metadata orientation normalization. (lines 433-455)

### 2.5 Limits / quota / timeouts specific to this endpoint
- Public IP daily cap: 10 uploaded image files/day. (lines 24-49)
- Upload constraints: per-file size (10 MB default), total upload MB (default 10 MB public), file count (default 10 public), max dimension 6000px (public/tools). Enforced during upload with early rejects. (Sources: `utils/limits.js` lines 83-158; `utils/uploadLimits.js` lines 117-239)
- Customer monthly quota: consumes `max(fileCount,1)` per request. (lines 323-359)
- Timeout per key type (global rules apply).

### 2.6 Response schema + example response
- Success: `{ "results": [ { "url", "format", "sizeBytes", "width", "height", "quality", "originalName" } ] }` (lines 831-933)
- Metadata action: `{ "results": [ { "originalName", "metadata": { sharp, originalMetadata, originalOrientation, normalizedOrientation, exif, rawExif, icc } } ] }` (lines 425-466)

### 2.7 Error codes specific to this endpoint
- `invalid_parameter` (missing/invalid action or CMYK unsupported). (lines 287-311, 939-945)
- `missing_field` (no image uploaded). (lines 362-368)
- `unsupported_media_type` (bad MIME). (lines 255-265)
- `file_too_large`, `too_many_files`, `total_upload_exceeded`, `dimension_exceeded`, `invalid_upload` from upload limits. (utils/uploadLimits)
- `monthly_quota_exceeded` (customer). (lines 338-359)
- `image_processing_failed` on processing errors. (lines 939-953)

### 2.8 cURL examples per module/action (REQUIRED)
> Note: All actions share the same processing pipeline except `metadata`, which returns metadata only.

**Resize example**
```bash
curl -X POST https://pixlab.davix.dev/v1/image \
  -H "X-Api-Key: YOUR_KEY" \
  -F "action=resize" \
  -F "images=@/path/input.jpg" \
  -F "width=1200" \
  -F "height=800" \
  -F "enlarge=true" \
  -F "format=webp"
```

**Crop example**
```bash
curl -X POST https://pixlab.davix.dev/v1/image \
  -H "X-Api-Key: YOUR_KEY" \
  -F "action=crop" \
  -F "images=@/path/input.png" \
  -F "cropX=10" -F "cropY=20" -F "cropWidth=300" -F "cropHeight=200" \
  -F "format=jpeg"
```

**Transform example**
```bash
curl -X POST https://pixlab.davix.dev/v1/image \
  -H "X-Api-Key: YOUR_KEY" \
  -F "action=transform" \
  -F "images=@/path/input.png" \
  -F "rotate=90" -F "flipH=true" -F "flipV=false" \
  -F "normalizeOrientation=true" \
  -F "format=png"
```

**Compression example**
```bash
curl -X POST https://pixlab.davix.dev/v1/image \
  -H "X-Api-Key: YOUR_KEY" \
  -F "action=compress" \
  -F "images=@/path/input.jpg" \
  -F "targetSizeKB=150" \
  -F "quality=80" \
  -F "format=jpeg"
```

**PDF export example (multi-page)**
```bash
curl -X POST https://pixlab.davix.dev/v1/image \
  -H "X-Api-Key: YOUR_KEY" \
  -F "action=pdf" \
  -F "images=@/path/page1.png" \
  -F "images=@/path/page2.png" \
  -F "format=pdf" \
  -F "pdfMode=multi" \
  -F "pdfPageSize=a4" \
  -F "pdfOrientation=portrait" \
  -F "pdfMargin=12" \
  -F "pdfEmbedFormat=jpeg" \
  -F "pdfJpegQuality=85"
```

**Metadata example**
```bash
curl -X POST https://pixlab.davix.dev/v1/image \
  -H "X-Api-Key: YOUR_KEY" \
  -F "action=metadata" \
  -F "images=@/path/input.jpg" \
  -F "includeRawExif=true" \
  -F "normalizeOrientation=true"
```

## 3) Endpoint: POST /v1/tools
### 3.1 Purpose & high-level flow
Runs analysis tools on uploaded images (metadata, colors, palettes, hashes, similarity, etc.) and returns structured results; no output files are saved. (Source: `routes/tools-route.js` lines 240-535)

### 3.2 Content-Type and input modes supported / not supported
- **Supported:** `multipart/form-data` with image files (field names not enforced; multer accepts any). (Source: `utils/uploadLimits.js` default any-mode; `routes/tools-route.js` lines 233-238)
- **Not supported:** JSON-only bodies for image data.
- Allowed files: any uploaded file passes multer; processing assumes images. Dimension limits enforced for image mimetypes. (Source: `routes/tools-route.js` lines 343-356)

### 3.3 Tools supported (actions list)
`metadata`, `colors`, `detect-format`, `orientation`, `hash`, `similarity`, `dimensions`, `palette`, `transparency`, `quality`, `efficiency`. (Source: tool checks in `routes/tools-route.js` lines 359-484)
- **metadata:** format, mime, width/height, sizeBytes, EXIF (trimmed or raw).
- **colors:** dominant color + palette (hex strings). (lines 370-372)
- **detect-format:** format/mime and animation flag. (lines 374-380)
- **orientation:** portrait/landscape/square + EXIF rotation suggestion. (lines 382-399)
- **hash:** phash by default; md5/sha1/sha256 if requested. (lines 401-417)
- **similarity:** computes phash pairwise or to-first; includes boolean `isSimilar` vs threshold. (lines 418-535)
- **dimensions:** width, height, aspectRatio, orientationClass. (lines 422-435)
- **palette:** dominant + list of RGB/hex objects. (lines 438-454)
- **transparency:** hasAlpha and ratioTransparent (sampled). (lines 456-468)
- **quality:** sharpness/score heuristic. (lines 471-478)
- **efficiency:** estimated size if re-encoded to given format/quality. (lines 480-483)

### 3.4 Parameters (table)
| Name | Type | Required | Default | Constraints | Notes |
| --- | --- | --- | --- | --- | --- |
| action | string | Yes | — | `single` or `multitask` | `single` requires exactly one tool. (lines 247-325)
| tools | string | Yes | — | Comma-separated list | Parsed via `split(',')`; arrays (`tools[]`) are **not supported** and will error. (lines 310-317, 65-71)
| includeRawExif | bool | No | `false` | Only affects metadata tool. (lines 327-330, 365-367)
| paletteSize | int | No | 5 | Clamped 1..16; affects `colors`/`palette`. (lines 330-332, 370-454)
| hashType | string | No | `phash` | `phash`, `md5`, `sha1`, `sha256`; affects `hash`. (lines 332-417)
| qualitySample | int | No | 256 | Clamped 64..512; affects `quality`. (lines 333-478)
| transparencySample | int | No | 64 | Clamped 16..128; affects `transparency`. (lines 334-468)
| similarityMode | string | No | `pairs` | `pairs` or `toFirst`; affects `similarity`. (lines 335-338, 493-535)
| similarityThreshold | int | No | 8 | Clamped 0..64; similarity cutoff. (lines 336-337, 493-535)
| efficiencyFormat | string | No | — | `jpeg/webp/avif/png` | Only used by `efficiency`. (lines 338-339, 480-483)
| efficiencyQuality | int | No | — | Used with efficiencyFormat | (lines 338-339, 480-483)

### 3.5 Limits / quota / timeouts specific to this endpoint
- Public IP daily cap: 10 files/day. (lines 41-63)
- Upload constraints: default 10 files, 10 MB total, 10 MB/file, 6000px max dimension for images. (Global limits section)
- Customer monthly quota: consumes `max(fileCount,1)` per call. (lines 265-298)
- Timeout per key type (global rules apply).

### 3.6 Response schema + example response
- Success: `{ "results": [ { "originalName", "tools": { ...tool outputs... } } ], "batch": { "similarity": [ ... ] }? }` (lines 485-535)
- Example snippet: `"metadata": {"format":"jpeg","mimeType":"image/jpeg","width":800,"height":600,"sizeBytes":12345,"exif":{...}}`

### 3.7 Error codes specific to this endpoint
- `invalid_parameter` (missing/invalid action, missing tools, too many tools for single, similarity over 25 in pairs). (lines 247-325, 493-503)
- `missing_field` (no files). (lines 301-307)
- Upload-related: `file_too_large`, `too_many_files`, `total_upload_exceeded`, `dimension_exceeded`, `invalid_upload`. (upload middleware)
- `monthly_quota_exceeded` (customer). (lines 277-298)
- `invalid_upload` when image cannot be read. (lines 343-355)
- `tool_processing_failed` on processing errors. (lines 534-543)

### 3.8 cURL examples per tool-selection mode (REQUIRED)
**Comma-separated tools list (supported)**
```bash
curl -X POST https://pixlab.davix.dev/v1/tools \
  -H "X-Api-Key: YOUR_KEY" \
  -F "action=multitask" \
  -F "files=@/path/input1.jpg" \
  -F "files=@/path/input2.png" \
  -F "tools=metadata,colors,detect-format,orientation,hash,similarity,dimensions,palette,transparency,quality,efficiency" \
  -F "includeRawExif=true" \
  -F "paletteSize=8" \
  -F "hashType=sha256" \
  -F "qualitySample=256" \
  -F "transparencySample=64" \
  -F "similarityMode=pairs" \
  -F "similarityThreshold=8" \
  -F "efficiencyFormat=webp" \
  -F "efficiencyQuality=75"
```

**Repeated `tools[]` fields**
> Code expects a comma-separated string; sending repeated `tools[]` fields will not be parsed (array lacks `.split`), so this mode is effectively unsupported and will throw. Example shown for completeness:
```bash
curl -X POST https://pixlab.davix.dev/v1/tools \
  -H "X-Api-Key: YOUR_KEY" \
  -F "action=single" \
  -F "files=@/path/input.jpg" \
  -F "tools[]=metadata" -F "tools[]=colors" \
  -F "includeRawExif=true" -F "paletteSize=5"
```

## 4) Endpoint: POST /v1/pdf
### 4.1 Purpose & high-level flow
Performs various PDF operations: merge, split, compress, convert pages to images, extract images, watermark, rotate, metadata editing, reorder, delete pages, extract pages, flatten, encrypt/decrypt. Outputs saved to `/pdf` and URLs returned. (Source: `routes/pdf-route.js` lines 333-836)

### 4.2 Content-Type and input modes supported / not supported
- **Supported:** `multipart/form-data` with PDF files (field names not enforced) and optional `watermarkImage` (image). (Source: `routes/pdf-route.js` lines 73-78, 333-348)
- **Allowed PDF MIME:** `application/pdf` only; others rejected. (lines 20-62)
- **Not supported:** JSON-only uploads for PDF content.

### 4.3 Actions supported
`merge`, `to-images`, `compress`, `extract-images`, `watermark`, `rotate`, `metadata`, `reorder`, `delete-pages`, `extract`, `flatten`, `encrypt`, `decrypt`, `split`. (Source: action branches lines 398-836)

### 4.4 Parameters per action (tables)
**merge**
| Name | Type | Required | Default | Constraints | Notes |
| --- | --- | --- | --- | --- | --- |
| action | string | Yes | — | `merge` | |
| files | files | Yes (≥1) | — | PDF MIME only | Multiple PDFs accepted. (lines 398-418)
| sortByName | bool | No | `false` | Sorts inputs by filename before merge. (lines 406-418)
| (others) | — | — | — | Ignored | Any other params ignored.

**to-images**
| Name | Type | Required | Default | Constraints | Notes |
| action | string | Yes | — | `to-images` | |
| file | file | Yes | — | Single PDF | First PDF used. (lines 420-459)
| pages | string | No | `all` | `all`, `first`, comma/range list | Filter pages. (lines 430-459, 80-104)
| toFormat | string | No | `png` | `jpeg/jpg/png/webp`; else `png` | Controls output format. (lines 430-459, 212-282)
| width | int | No | null | Parsed int | Optional scale-x. (lines 430-459, 212-282)
| height | int | No | null | Parsed int | Optional scale-y. (lines 430-459, 212-282)
| dpi | int | No | 150 | Parsed int | Rendering DPI. (lines 430-459, 212-282)
| (others) | — | — | — | Ignored | |

**compress**
| Name | Type | Required | Default | Constraints | Notes |
| action | string | Yes | — | `compress` | |
| file | file | Yes | — | PDF | Compresses by rebuilding PDF via pdf-lib. (lines 462-474)
| (others) | — | — | — | Ignored |

**extract-images**
| Name | Type | Required | Default | Constraints | Notes |
| action | string | Yes | — | `extract-images` | |
| file | file | Yes | — | PDF | Reuses `pdfToImages`; output format from `imageFormat` or default `png`. (lines 476-503)
| pages | string | No | `all` | Same parsing as to-images | (lines 476-503, 80-104)
| imageFormat | string | No | `png` | Same accepted as to-images | (lines 476-503)
| (others) | — | — | — | Ignored |

**watermark**
| Name | Type | Required | Default | Constraints | Notes |
| action | string | Yes | — | `watermark` | |
| file | file | Yes | — | PDF | |
| watermarkText | string | Conditionally | — | Required if no image | At least text or image must be provided. (lines 505-516)
| watermarkImage | file | Conditionally | — | Image; optional alongside text | (lines 507-536)
| pages | string | No | `all` | Page selector. (lines 517-521)
| opacity | number | No | 0.3 | 0..1 | (lines 521-559)
| margin | int | No | 24 | 0..5000 | (lines 521-559)
| position | string | No | `center` | Position helper. (lines 521-559)
| fontSize | int | No | 24 | 1..400 | Text only. (lines 521-572)
| color | string | No | `#000000` | Hex | Text only. (lines 525-571)
| watermarkScale | number | No | 0.25 | 0.01..1 | Image only. (lines 525-558)
| (others) | — | — | — | Ignored |

**rotate**
| Name | Type | Required | Default | Constraints | Notes |
| action | string | Yes | — | `rotate` | |
| file | file | Yes | — | PDF | |
| degrees | int | Yes | — | Must be 90/180/270 | Otherwise 400 error. (lines 584-608)
| pages | string | No | `all` | Page selector. (lines 595-599)
| (others) | — | — | — | Ignored |

**metadata**
| Name | Type | Required | Default | Constraints | Notes |
| action | string | Yes | — | `metadata` | |
| file | file | Yes | — | PDF | |
| cleanAllMetadata | bool | No | `false` | If true, clears common fields. (lines 611-633)
| title/author/subject/keywords/creator/producer | string | No | — | Set corresponding PDF metadata. (lines 614-627)
| (others) | — | — | — | Ignored |

**reorder**
| Name | Type | Required | Default | Constraints | Notes |
| action | string | Yes | — | `reorder` | |
| file | file | Yes | — | PDF | |
| order | JSON array | Yes | — | Must include all pages exactly once | Otherwise 400 invalid_parameter. (lines 636-668)
| (others) | — | — | — | Ignored |

**delete-pages**
| Name | Type | Required | Default | Constraints | Notes |
| action | string | Yes | — | `delete-pages` | |
| file | file | Yes | — | PDF | |
| pages | string | Yes | — | Cannot include all pages | Uses `parsePageNumbers`; deleting all pages is rejected. (lines 670-688)
| (others) | — | — | — | Ignored |

**extract (page extraction)**
| Name | Type | Required | Default | Constraints | Notes |
| action | string | Yes | — | `extract` | |
| file | file | Yes | — | PDF | |
| mode | string | No | `single` | `single` combines pages into one PDF; `multiple` emits one file per page. (lines 691-725)
| pages | string | No | `all` | Page selector. (lines 691-725, 80-104)
| (others) | — | — | — | Ignored |

**flatten**
| Name | Type | Required | Default | Constraints | Notes |
| action | string | Yes | — | `flatten` | |
| file | file | Yes | — | PDF | |
| flattenForms | bool | No | `true` | If true and form exists, it is flattened. (lines 728-742)
| (others) | — | — | — | Ignored |

**encrypt**
| Name | Type | Required | Default | Constraints | Notes |
| action | string | Yes | — | `encrypt` | |
| file | file | Yes | — | PDF | |
| userPassword | string | Yes | — | Required | Missing → 400. (lines 744-749)
| ownerPassword | string | No | userPassword | — | | 
| (others) | — | — | — | Ignored |
| **Dependency:** Requires `qpdf` installed; otherwise `invalid_parameter` error. (lines 750-768)

**decrypt**
| Name | Type | Required | Default | Constraints | Notes |
| action | string | Yes | — | `decrypt` | |
| file | file | Yes | — | PDF | |
| password | string | Yes | — | Required | Missing → 400. (lines 774-799)
| **Dependency:** Requires `qpdf` installed; otherwise `invalid_parameter` error. (lines 779-781)

**split**
| Name | Type | Required | Default | Constraints | Notes |
| action | string | Yes | — | `split` | |
| file | file | Yes | — | PDF | |
| ranges | string | Yes | — | Comma of `start-end` (1-based) | Required; missing → 400. (lines 803-829)
| prefix | string | No | `split_` | Used to prefix output filenames. (lines 813-827)
| (others) | — | — | — | Ignored |

### 4.5 Limits / quota / timeouts specific to this endpoint
- Public IP daily cap: 10 PDF files/day. (lines 22-49)
- Upload constraints: default 10 files, 10 MB total, 10 MB/file; no dimension check for PDFs. Additional file allowance of 1 for optional watermark image. (upload middleware config lines 73-78)
- Customer monthly quota: consumes `files.length || 1`. (lines 343-383)
- Timeout per key type (global rules apply).

### 4.6 Response schema per action + example responses
- **merge/compress/watermark/rotate/metadata/reorder/delete-pages/extract(flatten/encrypt/decrypt)**: `{ "url": "<absolute>", ... }` with action-specific fields (e.g., `sizeBytes`, `pageCount`, `compressionRatio`). (lines 398-608, 611-742, 744-803, 803-829)
- **to-images/extract-images:** `{ "results": [ { url, format, sizeBytes, width, height, pageNumber } ] }` (lines 430-503)
- **extract (mode=multiple):** `{ "results": [ { url, page } ] }`; mode=single returns single `url` + `pageCount`. (lines 691-725)

### 4.7 Error codes specific to this endpoint
- `invalid_parameter` (unsupported action, invalid degrees, missing watermark input, bad order, qpdf missing, etc.). (lines 505-836)
- `missing_field` (no action, no PDF, missing ranges). (lines 386-427, 803-811)
- `unsupported_media_type` (non-PDF upload). (lines 51-62)
- Upload errors: `file_too_large`, `too_many_files`, `total_upload_exceeded`, `invalid_upload`. (upload middleware)
- `monthly_quota_exceeded` (customer). (lines 358-384)
- `pdf_tool_failed` on unhandled processing errors. (lines 838-845)

### 4.8 cURL examples per action (REQUIRED)
**merge**
```bash
curl -X POST https://pixlab.davix.dev/v1/pdf \
  -H "X-Api-Key: YOUR_KEY" \
  -F "action=merge" \
  -F "files=@/path/a.pdf" \
  -F "files=@/path/b.pdf" \
  -F "sortByName=true"
```

**split**
```bash
curl -X POST https://pixlab.davix.dev/v1/pdf \
  -H "X-Api-Key: YOUR_KEY" \
  -F "action=split" \
  -F "file=@/path/input.pdf" \
  -F "ranges=1-2,3-5" \
  -F "prefix=part_"
```

**compress**
```bash
curl -X POST https://pixlab.davix.dev/v1/pdf \
  -H "X-Api-Key: YOUR_KEY" \
  -F "action=compress" \
  -F "file=@/path/input.pdf"
```

**to-images**
```bash
curl -X POST https://pixlab.davix.dev/v1/pdf \
  -H "X-Api-Key: YOUR_KEY" \
  -F "action=to-images" \
  -F "file=@/path/input.pdf" \
  -F "pages=1-3" \
  -F "toFormat=jpeg" \
  -F "width=1200" \
  -F "height=1600" \
  -F "dpi=200"
```

**extract-images**
```bash
curl -X POST https://pixlab.davix.dev/v1/pdf \
  -H "X-Api-Key: YOUR_KEY" \
  -F "action=extract-images" \
  -F "file=@/path/input.pdf" \
  -F "pages=first" \
  -F "imageFormat=png"
```

**watermark**
```bash
curl -X POST https://pixlab.davix.dev/v1/pdf \
  -H "X-Api-Key: YOUR_KEY" \
  -F "action=watermark" \
  -F "file=@/path/input.pdf" \
  -F "watermarkText=CONFIDENTIAL" \
  -F "watermarkImage=@/path/logo.png" \
  -F "pages=all" \
  -F "opacity=0.4" \
  -F "margin=24" \
  -F "position=bottom-right" \
  -F "fontSize=32" \
  -F "color=#FF0000" \
  -F "watermarkScale=0.2"
```

**rotate**
```bash
curl -X POST https://pixlab.davix.dev/v1/pdf \
  -H "X-Api-Key: YOUR_KEY" \
  -F "action=rotate" \
  -F "file=@/path/input.pdf" \
  -F "degrees=90" \
  -F "pages=1,3-4"
```

**metadata**
```bash
curl -X POST https://pixlab.davix.dev/v1/pdf \
  -H "X-Api-Key: YOUR_KEY" \
  -F "action=metadata" \
  -F "file=@/path/input.pdf" \
  -F "cleanAllMetadata=true" \
  -F "title=New Title" \
  -F "author=PixLab" \
  -F "subject=Report" \
  -F "keywords=tag1,tag2" \
  -F "creator=PixLab" \
  -F "producer=PixLab"
```

**reorder**
```bash
curl -X POST https://pixlab.davix.dev/v1/pdf \
  -H "X-Api-Key: YOUR_KEY" \
  -F "action=reorder" \
  -F "file=@/path/input.pdf" \
  -F "order=[2,1,3]"
```

**delete-pages**
```bash
curl -X POST https://pixlab.davix.dev/v1/pdf \
  -H "X-Api-Key: YOUR_KEY" \
  -F "action=delete-pages" \
  -F "file=@/path/input.pdf" \
  -F "pages=2,4"
```

**extract (pages)**
```bash
curl -X POST https://pixlab.davix.dev/v1/pdf \
  -H "X-Api-Key: YOUR_KEY" \
  -F "action=extract" \
  -F "file=@/path/input.pdf" \
  -F "mode=multiple" \
  -F "pages=1-3"
```

**flatten**
```bash
curl -X POST https://pixlab.davix.dev/v1/pdf \
  -H "X-Api-Key: YOUR_KEY" \
  -F "action=flatten" \
  -F "file=@/path/input.pdf" \
  -F "flattenForms=true"
```

**encrypt**
```bash
curl -X POST https://pixlab.davix.dev/v1/pdf \
  -H "X-Api-Key: YOUR_KEY" \
  -F "action=encrypt" \
  -F "file=@/path/input.pdf" \
  -F "userPassword=secret123" \
  -F "ownerPassword=owner456"
```

**decrypt**
```bash
curl -X POST https://pixlab.davix.dev/v1/pdf \
  -H "X-Api-Key: YOUR_KEY" \
  -F "action=decrypt" \
  -F "file=@/path/encrypted.pdf" \
  -F "password=secret123"
```
