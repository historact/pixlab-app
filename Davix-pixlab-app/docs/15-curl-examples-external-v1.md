# External API `/v1/*` cURL Examples (Code-Evidenced)

## How to run these examples

```bash
export BASE_URL="https://your-pixlab-host"
export API_KEY="<YOUR_API_KEY>"
```

Canonical auth header (recommended for all environments):

```bash
-H "X-Api-Key: $API_KEY"
```

Alternate header (also accepted):

```bash
-H "Authorization: Bearer $API_KEY"
```

Key types supported by server auth flow:
- **owner key** (`API_KEYS` but not in `PUBLIC_API_KEYS`)
- **public key** (`PUBLIC_API_KEYS`)
- **customer key** (DB lookup via `findCustomerKeyByPlaintext`)

Production restriction: API key in body/query is rejected with `api_key_location_not_allowed`; use headers only in production.

Idempotency header is optional but supported:

```bash
-H "Idempotency-Key: req_12345678"
```

---

## `POST /v1/h2i`

### Action inventory (code-enforced)

| Action | Supported |
|---|---|
| `image` | ✅ |
| `pdf` | ✅ |

Checklist:
- /v1/h2i actions: [x] image [x] pdf

### Content-Type
`/v1/h2i` accepts JSON or form-urlencoded bodies because global middleware enables both `bodyParser.json(...)` and `bodyParser.urlencoded(...)`.

### Common parameters

| Field | Type | Required | Default | Validation / clamp | Notes |
|---|---|---|---|---|---|
| `action` | string (`image` or `pdf`) | required | none | rejected if missing/other value | controls output mode |
| `html` | string | required | none | max length `GLOBAL_MAX_HTML_CHARS` (default 100000), else `html_too_large` | rendered as body or full doc |
| `css` | string | optional | none | no explicit clamp | when provided, injected in `<style>` wrapper |
| `width` | int | optional | 1000 | clamp 1..`GLOBAL_MAX_RENDER_WIDTH` (default 5000) | viewport width |
| `height` | int | optional | 1500 | clamp 1..`GLOBAL_MAX_RENDER_HEIGHT` (default 8000) | viewport height |
| `format` | string | optional | `png` (image mode) | only `jpeg` gets jpeg output; everything else becomes png | ignored in pdf mode |
| `pdfFormat` | string | conditional (`action=pdf`) | `A4` | only `LETTER` maps to `Letter`; all other values become `A4` | pdf only |
| `pdfLandscape` | bool-ish (`true` string / bool) | conditional (`action=pdf`) | `false` | parsed by bool parser | pdf only |
| `pdfMargin` | int | conditional (`action=pdf`) | 24 | parseInt else default | px margin on all sides |
| `preferCSSPageSize` | bool-ish | conditional (`action=pdf`) | `true` | parsed by bool parser | pdf only |
| `scale` | number | conditional (`action=pdf`) | `1` | parseFloat else default | pdf render scale |
| `printMode` | bool-ish | conditional (`action=pdf`) | `false` | parsed by bool parser | enables print media emulation |
| `printBackground` | bool-ish | conditional (`action=pdf`) | `true` | parsed by bool parser | include CSS backgrounds |

### Action: `image`

```bash
curl -X POST "$BASE_URL/v1/h2i" \
  -H "X-Api-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: req_h2i_image_001" \
  -d '{
    "action": "image",
    "html": "<div style=""width:100%;height:100%;background:#111;color:#fff;display:flex;align-items:center;justify-content:center"">Hello</div>",
    "css": "body { margin: 0; }",
    "width": 1200,
    "height": 1600,
    "format": "jpeg",
    "pdfFormat": "A4",
    "pdfLandscape": false,
    "pdfMargin": 24,
    "preferCSSPageSize": true,
    "scale": 1,
    "printMode": false,
    "printBackground": true
  }'
```

### Action: `pdf`

```bash
curl -X POST "$BASE_URL/v1/h2i" \
  -H "X-Api-Key: $API_KEY" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "action=pdf" \
  --data-urlencode "html=<h1>Invoice</h1><p>Line item</p>" \
  --data-urlencode "css=body{font-family:Arial}" \
  --data-urlencode "width=1000" \
  --data-urlencode "height=1500" \
  --data-urlencode "format=png" \
  --data-urlencode "pdfFormat=LETTER" \
  --data-urlencode "pdfLandscape=true" \
  --data-urlencode "pdfMargin=32" \
  --data-urlencode "preferCSSPageSize=true" \
  --data-urlencode "scale=1" \
  --data-urlencode "printMode=true" \
  --data-urlencode "printBackground=true"
```

### Example response shape

Success:

```json
{ "url": "https://host/h2i/<file>?exp=...&sig=...", "request_id": "..." }
```

Common errors: `invalid_parameter`, `missing_field`, `html_too_large`, `render_size_exceeded`, `server_busy`, `timeout`, `html_render_failed`, `rate_limit_exceeded`.

### Relevant limits
- Public daily request/file counting for endpoint.
- Timeout comes from per-key-type timeout middleware.
- Concurrency gate via h2i semaphore (returns `server_busy` if wait times out).
- Render limits: width/height clamps + max pixel cap.

---

## `POST /v1/image`

### Action inventory (code-enforced)

| Action |
|---|
| `format` |
| `resize` |
| `crop` |
| `transform` |
| `compress` |
| `enhance` |
| `padding` |
| `frame` |
| `background` |
| `watermark` |
| `pdf` |
| `metadata` |
| `multitask` |

Checklist:
- /v1/image actions: [x] format [x] resize [x] crop [x] transform [x] compress [x] enhance [x] padding [x] frame [x] background [x] watermark [x] pdf [x] metadata [x] multitask

### Content-Type
`multipart/form-data` with `images` upload field (plus optional `watermarkImage`).

### Shared image parameters

> Important: for all non-`metadata` actions, the implementation applies one common processing pipeline; action labels are accepted values, but most transforms are driven by which fields you include.

| Field | Type | Required | Default | Validation / clamp | Notes |
|---|---|---|---|---|---|
| `action` | string | required | none | must be one of action inventory | |
| `images` | file[] | required | none | MIME in allowed image set | main inputs |
| `watermarkImage` | file | optional | none | image MIME only | used when watermarking |
| `format` | string | optional | source format | `jpg` normalized to `jpeg` | output format (`pdf` handled specially) |
| `width`,`height` | int | optional | none | parseInt | resize with `fit: inside`, no enlarge unless `enlarge=true` |
| `enlarge` | bool-ish | optional | false | bool parser | controls `withoutEnlargement` |
| `cropX`,`cropY`,`cropWidth`,`cropHeight` | int | optional group | none | only applied if all 4 finite ints | crop extract rectangle |
| `rotate` | int | optional | none | parseInt finite | rotate angle |
| `flipH`,`flipV` | bool-ish | optional | false | bool parser | horizontal/vertical flips |
| `targetSizeKB` | int | optional | none | parseInt; binary-search quality 20..90 | approximate output target |
| `quality` | int | optional | none | parseInt | encoder quality |
| `keepMetadata` | bool-ish | optional | false | bool parser | include metadata in output |
| `normalizeOrientation` | bool-ish | optional | false | bool parser | auto rotate by EXIF orientation |
| `blur` | number/bool-ish | optional | none | clamp 0..500; `0` still blur() | blur control |
| `sharpen` | number/bool-ish | optional | none | clamp 0..10 (bool true => 1) | sharpen control |
| `grayscale`,`sepia` | bool-ish | optional | false | bool parser | color effects |
| `brightness`,`contrast`,`saturation` | number | optional | 1 | each clamp 0..2 | tonal controls |
| `pad`,`padTop`,`padRight`,`padBottom`,`padLeft` | int | optional | 0 | negatives clamped to 0 before extend | padding |
| `padColor` | color string | optional | `#ffffff` | no strict parser | used for pad + some flatten |
| `border` | int | optional | 0 | negative -> 0 | border thickness |
| `borderColor` | color string | optional | `#000000` | no strict parser | border color |
| `borderRadius` | int | optional | 0 | negative -> 0 | rounded corners |
| `backgroundColor` | color string | optional | none | no strict parser | flatten background |
| `backgroundBlur` | number | optional | none | clamp 0..200, fallback 20 if truthy non-numeric | blur background compositing |
| `watermarkText` | string | optional | none | none | text watermark |
| `watermarkFontSize` | int | optional | 32 | clamp 6..400 | text watermark |
| `watermarkColor` | hex-ish | optional | `#ffffff` | fallback rgb(255,255,255) in SVG builder | text watermark |
| `watermarkOpacity` | number | optional | 0.35 | clamp 0..1 | text/image watermark |
| `watermarkPosition` | enum | optional | `center` | invalid -> `center` | center/top/bottom/left/right + corners |
| `watermarkMargin` | int | optional | 24 | clamp 0..5000 | watermark positioning |
| `watermarkScale` | number | optional | 0.25 | clamp 0.01..1 | image watermark size factor |
| `colorSpace` | string | optional | `srgb` | `grayscale`,`srgb`,`cmyk`; cmyk may error by build | output color space |
| `pdfMode` | `single`/`multi` | conditional (`format=pdf`) | `single` | only exact `multi` enables multi | PDF output mode |
| `pdfPageSize` | string | conditional (`format=pdf`) | `auto` | only `a4`/`letter` map to fixed size | pdf generation |
| `pdfOrientation` | `portrait`/`landscape` | conditional (`format=pdf`) | `portrait` | invalid -> portrait | pdf generation |
| `pdfMargin` | int | conditional (`format=pdf`) | 0 | parseInt | pdf page margin |
| `pdfEmbedFormat` | `png`/`jpeg` | conditional (`format=pdf`) | `png` | other -> `png`; `jpg` => `jpeg` | embed format in PDF |
| `pdfJpegQuality` | int | conditional (`format=pdf`) | 85 | clamp 20..100 | used for jpeg embed |
| `includeRawExif` | bool-ish | optional | false | read as string compare in metadata path | used by metadata action response |

### Full cURL template (use with each action)

```bash
curl -X POST "$BASE_URL/v1/image" \
  -H "X-Api-Key: $API_KEY" \
  -H "Idempotency-Key: req_img_001" \
  -F "action=<ACTION>" \
  -F "images=@/path/to/input1.jpg" \
  -F "images=@/path/to/input2.png" \
  -F "watermarkImage=@/path/to/watermark.png" \
  -F "format=webp" \
  -F "width=1200" -F "height=1200" -F "enlarge=false" \
  -F "cropX=0" -F "cropY=0" -F "cropWidth=1000" -F "cropHeight=1000" \
  -F "rotate=90" -F "flipH=true" -F "flipV=false" \
  -F "targetSizeKB=250" -F "quality=82" -F "keepMetadata=true" \
  -F "normalizeOrientation=true" -F "blur=1.2" -F "sharpen=1" \
  -F "grayscale=false" -F "sepia=false" \
  -F "brightness=1.05" -F "contrast=1.1" -F "saturation=1.0" \
  -F "pad=20" -F "padTop=20" -F "padRight=20" -F "padBottom=20" -F "padLeft=20" \
  -F "padColor=#ffffff" -F "border=8" -F "borderColor=#000000" -F "borderRadius=24" \
  -F "backgroundColor=#ffffff" -F "backgroundBlur=0" \
  -F "watermarkText=PixLab" -F "watermarkFontSize=36" -F "watermarkColor=#ffffff" \
  -F "watermarkOpacity=0.35" -F "watermarkPosition=bottom-right" -F "watermarkMargin=24" -F "watermarkScale=0.25" \
  -F "colorSpace=srgb" \
  -F "pdfMode=single" -F "pdfPageSize=auto" -F "pdfOrientation=portrait" -F "pdfMargin=0" \
  -F "pdfEmbedFormat=png" -F "pdfJpegQuality=85" \
  -F "includeRawExif=false"
```

### Action subsections

For each action below, use the full template above with `-F "action=<name>"`:
- `format`
- `resize`
- `crop`
- `transform`
- `compress`
- `enhance`
- `padding`
- `frame`
- `background`
- `watermark`
- `pdf`
- `multitask`

Metadata-specific example (`action=metadata`):

```bash
curl -X POST "$BASE_URL/v1/image" \
  -H "X-Api-Key: $API_KEY" \
  -F "action=metadata" \
  -F "images=@/path/to/input.jpg" \
  -F "normalizeOrientation=true" \
  -F "includeRawExif=true"
```

### Example response shape

Transform/PDF-like actions:

```json
{ "results": [{ "url": "https://host/image/<file>?exp=...&sig=...", "format": "webp", "sizeBytes": 12345 }], "request_id": "..." }
```

Metadata action:

```json
{ "results": [{ "originalName": "img.jpg", "metadata": { "sharp": {}, "originalMetadata": {}, "exif": {}, "rawExif": {} } }], "request_id": "..." }
```

Common errors: `missing_field`, `unsupported_media_type`, `dimension_exceeded`, `file_too_large`, `total_upload_exceeded`, `cmyk_not_supported` (as invalid parameter), `server_busy`, `timeout`.

### Relevant limits
- MIME allowlist: jpeg/png/webp/gif/avif/svg.
- Per-file upload limit from `GLOBAL_MAX_UPLOAD_BYTES` (default 10MB).
- Per-request file count/total bytes and optional dimension caps from resolved upload limits.
- Endpoint timeout by key type/plan.
- Endpoint concurrency semaphore.

---

## `POST /v1/pdf`

### Action inventory (code-enforced)

| Action |
|---|
| `merge` |
| `to-images` |
| `compress` |
| `extract-images` |
| `watermark` |
| `rotate` |
| `metadata` |
| `reorder` |
| `delete-pages` |
| `extract` |
| `flatten` |
| `encrypt` |
| `decrypt` |
| `split` |

Checklist:
- /v1/pdf actions: [x] merge [x] to-images [x] compress [x] extract-images [x] watermark [x] rotate [x] metadata [x] reorder [x] delete-pages [x] extract [x] flatten [x] encrypt [x] decrypt [x] split

### Content-Type
`multipart/form-data` with PDF files (`application/pdf`).

### Common required fields
- `action` (required)
- PDF input file(s): upload under `files` (merge uses multiple; other actions use first PDF)

### cURL examples per action

#### `merge`
```bash
curl -X POST "$BASE_URL/v1/pdf" -H "X-Api-Key: $API_KEY" \
  -F "action=merge" -F "files=@/path/a.pdf" -F "files=@/path/b.pdf" -F "sortByName=true"
```

#### `to-images`
```bash
curl -X POST "$BASE_URL/v1/pdf" -H "X-Api-Key: $API_KEY" \
  -F "action=to-images" -F "files=@/path/in.pdf" \
  -F "pages=1,3-5" -F "toFormat=webp" -F "width=1600" -F "height=1600" -F "dpi=200"
```

#### `compress`
```bash
curl -X POST "$BASE_URL/v1/pdf" -H "X-Api-Key: $API_KEY" \
  -F "action=compress" -F "files=@/path/in.pdf"
```

#### `extract-images`
```bash
curl -X POST "$BASE_URL/v1/pdf" -H "X-Api-Key: $API_KEY" \
  -F "action=extract-images" -F "files=@/path/in.pdf" -F "pages=all" -F "imageFormat=png"
```

#### `watermark`
```bash
curl -X POST "$BASE_URL/v1/pdf" -H "X-Api-Key: $API_KEY" \
  -F "action=watermark" -F "files=@/path/in.pdf" \
  -F "watermarkText=CONFIDENTIAL" -F "watermarkImage=@/path/wm.png" \
  -F "pages=1-3" -F "opacity=0.3" -F "margin=24" -F "position=center" \
  -F "fontSize=28" -F "color=#000000" -F "watermarkScale=0.25"
```

#### `rotate`
```bash
curl -X POST "$BASE_URL/v1/pdf" -H "X-Api-Key: $API_KEY" \
  -F "action=rotate" -F "files=@/path/in.pdf" -F "degrees=90" -F "pages=2-5"
```

#### `metadata`
```bash
curl -X POST "$BASE_URL/v1/pdf" -H "X-Api-Key: $API_KEY" \
  -F "action=metadata" -F "files=@/path/in.pdf" \
  -F "cleanAllMetadata=true" -F "title=My Title" -F "author=Me" -F "subject=Invoice" \
  -F "keywords=billing" -F "creator=PixLab" -F "producer=PixLab"
```

#### `reorder`
```bash
curl -X POST "$BASE_URL/v1/pdf" -H "X-Api-Key: $API_KEY" \
  -F "action=reorder" -F "files=@/path/in.pdf" -F 'order=[3,1,2]'
```

#### `delete-pages`
```bash
curl -X POST "$BASE_URL/v1/pdf" -H "X-Api-Key: $API_KEY" \
  -F "action=delete-pages" -F "files=@/path/in.pdf" -F "pages=2,4"
```

#### `extract`
```bash
curl -X POST "$BASE_URL/v1/pdf" -H "X-Api-Key: $API_KEY" \
  -F "action=extract" -F "files=@/path/in.pdf" -F "pages=1,3-4" -F "mode=multiple"
```

#### `flatten`
```bash
curl -X POST "$BASE_URL/v1/pdf" -H "X-Api-Key: $API_KEY" \
  -F "action=flatten" -F "files=@/path/in.pdf" -F "flattenForms=true"
```

#### `encrypt`
```bash
curl -X POST "$BASE_URL/v1/pdf" -H "X-Api-Key: $API_KEY" \
  -F "action=encrypt" -F "files=@/path/in.pdf" -F "userPassword=secret" -F "ownerPassword=owner-secret"
```

#### `decrypt`
```bash
curl -X POST "$BASE_URL/v1/pdf" -H "X-Api-Key: $API_KEY" \
  -F "action=decrypt" -F "files=@/path/in.pdf" -F "password=secret"
```

#### `split`
```bash
curl -X POST "$BASE_URL/v1/pdf" -H "X-Api-Key: $API_KEY" \
  -F "action=split" -F "files=@/path/in.pdf" -F "ranges=1-3,4-4,5-8" -F "prefix=part_"
```

### Selected parameter rules (validation/clamp highlights)
- `pages`: supports `all`, `first`, CSV values and ranges (`a-b`); invalid/empty falls back to `[1]`.
- `toFormat`: for `to-images`, only `jpeg/jpg/png/webp`, otherwise `png`.
- `dpi`: parseInt; default `150`.
- `degrees`: must be one of `90,180,270` for `rotate`.
- `order`: JSON array; must be full 1-based permutation of all pages.
- `mode` (`extract`): only exact `multiple` enables multi output; else `single`.
- `flattenForms`: bool-ish, default true.
- `userPassword`: required for encrypt; `ownerPassword` defaults to `userPassword`.
- `password`: required for decrypt.
- `watermark` clamps: `opacity` 0..1 default 0.3, `margin` 0..5000 default 24, `fontSize` 1..400 default 24, `watermarkScale` 0.01..1 default 0.25.

### Example response shape
- Single URL result actions: `{ "url": ".../pdf/<file>?exp=...&sig=...", "request_id": "..." }`
- Multi outputs actions (`to-images`, `extract-images`, `split`, `extract mode=multiple`): `{ "results": [...] }`

Common errors: `missing_field`, `invalid_parameter`, `unsupported_media_type`, `pdf_page_limit_exceeded`, `server_busy`, `timeout`, `pdf_tool_failed`.

### Relevant limits
- Input MIME must be `application/pdf`.
- Page caps enforced for `to-images`, `extract-images`, `split`.
- Public daily limit and concurrency semaphore.
- QPDF-dependent actions (`encrypt`/`decrypt`) fail if qpdf unavailable.

---

## `POST /v1/tools`

### Action inventory (code-enforced)

| Action | Supported |
|---|---|
| `single` | ✅ |
| `multitask` | ✅ |

Checklist:
- /v1/tools actions: [x] single [x] multitask plus tool list parsing rules

### Tool list parsing rules
- Tools are read from `tools` or `tools[]` body field.
- Parser splits comma-separated strings, trims, lowercases, drops empties.
- For `action=single`, exactly one parsed tool is required.

### Supported tool names (code-driven includes checks)
`metadata`, `colors`, `detect-format`, `orientation`, `hash`, `similarity`, `dimensions`, `palette`, `transparency`, `quality`, `efficiency`

### Parameters

| Field | Type | Required | Default | Validation / clamp | Notes |
|---|---|---|---|---|---|
| `action` | `single`/`multitask` | required | none | invalid -> error | |
| `images` | file[] | required | none | must be allowed image MIME | |
| `tools` / `tools[]` | comma-separated string | required | none | must parse to at least one tool | `single` requires exactly one |
| `includeRawExif` | `'true'` string to enable | optional | false | strict string compare | affects metadata exif payload |
| `paletteSize` | int | optional | 5 | clamp 1..16 | colors/palette tools |
| `hashType` | string | optional | `phash` | `md5`,`sha1`,`sha256` else fallback `phash` | hash tool |
| `qualitySample` | int | optional | 256 | clamp 64..512 | quality tool |
| `transparencySample` | int | optional | 64 | clamp 16..128 | transparency tool |
| `similarityMode` | `pairs`/`toFirst` | optional | `pairs` | only exact `tofirst` -> tofirst | similarity batch mode |
| `similarityThreshold` | int | optional | 8 | clamp 0..64 | similarity classification |
| `efficiencyFormat` | string | optional | null | no strict enum in route | efficiency tool |
| `efficiencyQuality` | number/string | optional | null | forwarded to estimator | efficiency tool |

### cURL: `single`
```bash
curl -X POST "$BASE_URL/v1/tools" -H "X-Api-Key: $API_KEY" \
  -F "action=single" \
  -F "images=@/path/in.jpg" \
  -F "tools=metadata" \
  -F "includeRawExif=true" \
  -F "paletteSize=8" -F "hashType=sha256" -F "qualitySample=256" \
  -F "transparencySample=64" -F "similarityMode=toFirst" -F "similarityThreshold=8" \
  -F "efficiencyFormat=webp" -F "efficiencyQuality=80"
```

### cURL: `multitask`
```bash
curl -X POST "$BASE_URL/v1/tools" -H "X-Api-Key: $API_KEY" \
  -F "action=multitask" \
  -F "images=@/path/a.jpg" -F "images=@/path/b.jpg" \
  -F "tools=metadata,dimensions,similarity,quality,efficiency,palette,colors,hash,detect-format,orientation,transparency" \
  -F "includeRawExif=false" \
  -F "paletteSize=6" -F "hashType=phash" -F "qualitySample=256" \
  -F "transparencySample=64" -F "similarityMode=pairs" -F "similarityThreshold=8" \
  -F "efficiencyFormat=webp" -F "efficiencyQuality=75"
```

### Example response shape

```json
{
  "results": [{ "originalName": "a.jpg", "tools": { "metadata": {}, "dimensions": {}, "quality": {} } }],
  "batch": { "similarity": [{ "aIndex": 0, "bIndex": 1, "distance": 7, "isSimilar": true }] },
  "request_id": "..."
}
```

Common errors: `invalid_parameter` (missing tools, wrong single count, similarity pairs >25 files), `missing_field`, `unsupported_media_type`, `invalid_upload`, `server_busy`, `timeout`, `tool_processing_failed`.

### Relevant limits
- MIME allowlist same as image endpoint.
- Upload limits from shared upload middleware.
- Similarity `pairs` mode supports max 25 files.
- Public daily limits + endpoint concurrency.

---

## Signed output URL behavior

For endpoints returning output `url`/`results[].url`:
- URLs are generated through signed URL builder.
- If signing secret is configured, URL includes `?exp=<unix>&sig=<hmac>`.
- If signing is required on static output routes, missing/invalid/expired signature yields 403 (`unauthorized`, `invalid_signature`, `expired`).
- If no signing secret, unsigned URL is returned.

Fetch output example:

```bash
curl -L "https://your-pixlab-host/pdf/abc123.pdf?exp=1700000000&sig=<sig>" -o output.pdf
```

---

## Production-vs-dev authentication note

Always send API key in headers. In production, body (`api_key`) and query (`?key=`) API keys are rejected. In non-production, server still resolves body/query as fallback.
