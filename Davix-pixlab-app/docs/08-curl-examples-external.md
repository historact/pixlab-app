# 14) External API cURL Examples (`/v1/*`)

> Source of truth: `server.js`, `routes/h2i-route.js`, `routes/image-route.js`, `routes/pdf-route.js`, `routes/tools-route.js`, `utils/signedUrls.js`, `utils/limits.js`, `utils/uploadLimits.js`.

## Setup

```bash
BASE="https://api.example.com"
API_KEY="pk_live_xxx"
```

Auth behavior (code-enforced):
- `X-Api-Key` and `Authorization: Bearer <key>` are accepted.
- In production, `api_key` body field and `?key=` query are rejected (`api_key_location_not_allowed`).
- `Idempotency-Key` is optional and supported.

---

## Endpoint: `POST /v1/h2i`

### Action: `image`

```bash
curl -sS -X POST "$BASE/v1/h2i" \
  -H "X-Api-Key: $API_KEY" \
  -H "Idempotency-Key: h2i-image-001" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "image",
    "html": "<div style=""width:100%;height:100%;display:flex;align-items:center;justify-content:center"">Hello</div>",
    "css": "body{margin:0}",
    "width": 1200,
    "height": 1600,
    "format": "jpeg"
  }'
```

| Parameter | Type | Required | Accepted values / format | Default | Range / enum / constraints | Description |
|---|---|---:|---|---|---|---|
| `Idempotency-Key` / `X-Idempotency-Key` (header) | string | no | opaque string | none | 8..128 chars; `[A-Za-z0-9._:-]+`; both names accepted | Optional idempotency token for dedupe/logging; echoed back as `Idempotency-Key` response header when valid. |
| `action` | string | yes | `image` | — | enum (`image`,`pdf`) | Selects image output mode. |
| `html` | string | yes | HTML string | — | max chars from plan/server render limits | Required render source. |
| `css` | string | no | CSS string | empty | — | Injected into `<style>` when set. |
| `width` | integer | no | positive int | `1000` | clamped `1..maxRenderWidth` | Viewport width. |
| `height` | integer | no | positive int | `1500` | clamped `1..maxRenderHeight` | Viewport height. |
| `format` | string | no | `png`,`jpeg`,`jpg`,other | `png` | only `jpeg` yields JPEG; everything else becomes PNG | Output image encoding. |

Notes:
- If `width*height` exceeds `maxRenderPixels`, request fails with `render_size_exceeded`.

### Action: `pdf`

```bash
curl -sS -X POST "$BASE/v1/h2i" \
  -H "X-Api-Key: $API_KEY" \
  -H "Idempotency-Key: idem-ext-001" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "pdf",
    "html": "<h1>Invoice</h1>",
    "css": "body{font-family:sans-serif}",
    "width": 1000,
    "height": 1500,
    "pdfFormat": "LETTER",
    "pdfLandscape": false,
    "pdfMargin": 24,
    "preferCSSPageSize": true,
    "scale": 1,
    "printMode": false,
    "printBackground": true
  }'
```

| Parameter | Type | Required | Accepted values / format | Default | Range / enum / constraints | Description |
|---|---|---:|---|---|---|---|
| `Idempotency-Key` / `X-Idempotency-Key` (header) | string | no | opaque string | none | 8..128 chars; `[A-Za-z0-9._:-]+`; both names accepted | Optional idempotency token for dedupe/logging; echoed back as `Idempotency-Key` response header when valid. |
| `action` | string | yes | `pdf` | — | enum (`image`,`pdf`) | Selects PDF output mode. |
| `html`,`css`,`width`,`height` | mixed | yes/no | same as image mode | same | same | Same validation/coercion as `action=image`. |
| `pdfFormat` | string | no | any string | `A4` | only `LETTER` (case-insensitive) maps to `Letter`; all others -> `A4` | Page format. |
| `pdfLandscape` | bool/string | no | `true`/`false` | `false` | bool parser | Landscape pages. |
| `pdfMargin` | int/string | no | integer px | `24` | parseInt fallback to default | Same margin on all sides. |
| `preferCSSPageSize` | bool/string | no | `true`/`false` | `true` | bool parser | Puppeteer `preferCSSPageSize`. |
| `scale` | number/string | no | numeric | `1` | parseFloat fallback to default | Puppeteer PDF scale. |
| `printMode` | bool/string | no | `true`/`false` | `false` | bool parser | Enables print media emulation. |
| `printBackground` | bool/string | no | `true`/`false` | `true` | bool parser | Includes backgrounds. |

---

## Endpoint: `POST /v1/image` (multipart form-data)

Supported actions: `format`, `resize`, `crop`, `transform`, `compress`, `enhance`, `padding`, `frame`, `background`, `watermark`, `pdf`, `metadata`, `multitask`.

### Shared image parameters (all actions unless noted)

| Parameter | Type | Required | Accepted values / format | Default | Range / enum / constraints | Description |
|---|---|---:|---|---|---|---|
| `Idempotency-Key` / `X-Idempotency-Key` (header) | string | no | opaque string | none | 8..128 chars; `[A-Za-z0-9._:-]+`; both names accepted | Optional idempotency token for dedupe/logging; echoed back as `Idempotency-Key` response header when valid. |
| `action` | string | yes | action list above | — | must match supported actions | Processing mode selector. |
| `images` | file[] | yes | image uploads | — | MIME must be jpeg/png/webp/gif/avif/svg | Input images. |
| `watermarkImage` | file | no | image upload | — | only used by watermark logic | Optional overlay file. |
| `format` | string | no | `jpeg`,`jpg`,`png`,`webp`,`avif`,`gif`,`svg`,`pdf` | keep source style | `jpg` normalized to `jpeg` | Output format. |
| `width`,`height` | int | no | parseInt | unset | resize `fit:inside`; no enlarge unless `enlarge=true` | Resize target. |
| `enlarge` | bool/string | no | true/false | false | bool parser | Allow upscaling. |
| `cropX`,`cropY`,`cropWidth`,`cropHeight` | int | no | all 4 finite ints | unset | crop applies only when all 4 provided | Extract region before later steps. |
| `rotate` | int | no | parseInt | unset | — | Rotation degrees. |
| `flipH`,`flipV` | bool/string | no | true/false | false | bool parser | Horizontal/vertical flips. |
| `targetSizeKB` | int | no | parseInt | unset | quality search loop 20..90 | Approximate output size. |
| `quality` | int | no | parseInt | encoder default | — | Encoder quality override. |
| `keepMetadata` | bool/string | no | true/false | false | bool parser | Preserve metadata if enabled. |
| `normalizeOrientation` | bool/string | no | true/false | false | bool parser | Apply EXIF orientation normalization. |
| `blur` | number | no | numeric | unset | clamp `0..500` | Blur filter. |
| `sharpen` | number/bool | no | numeric or true | unset | clamp `0..10`, bool true=>1 | Sharpen filter. |
| `grayscale`,`sepia` | bool/string | no | true/false | false | bool parser | Color effects. |
| `brightness`,`contrast`,`saturation` | number | no | numeric | `1` | each clamped `0..2` | Tone controls. |
| `pad`,`padTop`,`padRight`,`padBottom`,`padLeft` | int | no | parseInt | `0` | negatives treated as 0 | Padding controls. |
| `padColor` | string | no | color string | `#ffffff` | — | Padding/background fill. |
| `border`,`borderRadius` | int | no | parseInt | `0` | negatives treated as 0 | Border/frame controls. |
| `borderColor` | string | no | color string | `#000000` | — | Border color. |
| `backgroundColor` | string | no | color string | unset | — | Flatten background. |
| `backgroundBlur` | number | no | numeric | unset | clamp `0..200` | Blur-behind composite. |
| `watermarkText` | string | no | text | unset | — | Text watermark content. |
| `watermarkFontSize` | int | no | parseInt | `32` | clamp `6..400` | Text watermark size. |
| `watermarkColor` | string | no | hex-like | `#ffffff` | fallback RGB white if parse fails | Text watermark color. |
| `watermarkOpacity` | number | no | numeric | `0.35` | clamp `0..1` | Watermark alpha. |
| `watermarkPosition` | string | no | center/top/bottom/left/right/corners | `center` | invalid -> center | Overlay placement. |
| `watermarkMargin` | int | no | parseInt | `24` | clamp `0..5000` | Position margin. |
| `watermarkScale` | number | no | numeric | `0.25` | clamp `0.01..1` | Overlay size factor. |
| `colorSpace` | string | no | `srgb`,`grayscale`,`cmyk` | `srgb` | unsupported conversions can throw | Output color space. |
| `pdfMode` | string | no | `single`,`multi` | `single` | only exact `multi` enables multi-page output | Used when output is PDF. |
| `pdfPageSize` | string | no | `auto`,`a4`,`letter` | `auto` | unknown -> auto | PDF page sizing. |
| `pdfOrientation` | string | no | `portrait`,`landscape` | `portrait` | unknown -> portrait | PDF orientation. |
| `pdfMargin` | int | no | parseInt | `0` | — | PDF drawing margin. |
| `pdfEmbedFormat` | string | no | `png`,`jpeg`,`jpg` | `png` | `jpg` -> `jpeg`, invalid -> `png` | Embedded image format in PDF. |
| `pdfJpegQuality` | int | no | parseInt | `85` | clamp `20..100` | JPEG quality for PDF embed. |
| `includeRawExif` | bool/string | no | true/false | false | checked via string `'true'` in metadata action | Include raw EXIF blob. |

### Action: `format`
```bash
curl -sS -X POST "$BASE/v1/image" -H "X-Api-Key: $API_KEY" \
  -H "Idempotency-Key: idem-ext-002" \
  -F "action=format" -F "images=@./samples/a.jpg" -F "format=webp"
```
| Parameter | Type | Required | Accepted values / format | Default | Range / enum / constraints | Description |
|---|---|---:|---|---|---|---|
| `Idempotency-Key` / `X-Idempotency-Key` (header) | string | no | opaque string | none | 8..128 chars; `[A-Za-z0-9._:-]+`; both names accepted | Optional idempotency token for dedupe/logging; echoed back as `Idempotency-Key` response header when valid. |
| `action` | string | yes | `format` | — | — | Format conversion intent label. |
| `images` | file[] | yes | image files | — | MIME-validated | Inputs. |
| `format` | string | no | shared table | source/encoder default | shared constraints | Output encoding target. |

### Action: `resize`
```bash
curl -sS -X POST "$BASE/v1/image" -H "X-Api-Key: $API_KEY" \
  -H "Idempotency-Key: idem-ext-003" \
  -F "action=resize" -F "images=@./samples/a.jpg" -F "width=1024" -F "height=768"
```
| Parameter | Type | Required | Accepted values / format | Default | Constraints | Description |
|---|---|---:|---|---|---|---|
| `Idempotency-Key` / `X-Idempotency-Key` (header) | string | no | opaque string | none | 8..128 chars; `[A-Za-z0-9._:-]+`; both names accepted | Optional idempotency token for dedupe/logging; echoed back as `Idempotency-Key` response header when valid. |
| `action` | string | yes | `resize` | — | — | Resize intent label. |
| `images` | file[] | yes | image files | — | MIME-validated | Inputs. |
| `width`,`height`,`enlarge` | mixed | no | shared table | unset/false | shared constraints | Resize controls. |

### Action: `crop`
```bash
curl -sS -X POST "$BASE/v1/image" -H "X-Api-Key: $API_KEY" \
  -H "Idempotency-Key: idem-ext-004" \
  -F "action=crop" -F "images=@./samples/a.jpg" -F "cropX=0" -F "cropY=0" -F "cropWidth=800" -F "cropHeight=600"
```
| Parameter | Type | Required | Accepted values / format | Default | Constraints | Description |
|---|---|---:|---|---|---|---|
| `Idempotency-Key` / `X-Idempotency-Key` (header) | string | no | opaque string | none | 8..128 chars; `[A-Za-z0-9._:-]+`; both names accepted | Optional idempotency token for dedupe/logging; echoed back as `Idempotency-Key` response header when valid. |
| `action` | string | yes | `crop` | — | — | Crop intent label. |
| `images` | file[] | yes | image files | — | MIME-validated | Inputs. |
| `cropX`,`cropY`,`cropWidth`,`cropHeight` | int | no | all 4 values | unset | applied only if all finite | Crop rectangle. |

### Action: `transform`
```bash
curl -sS -X POST "$BASE/v1/image" -H "X-Api-Key: $API_KEY" \
  -H "Idempotency-Key: idem-ext-005" \
  -F "action=transform" -F "images=@./samples/a.jpg" -F "rotate=90" -F "flipH=true"
```
| Parameter | Type | Required | Accepted values / format | Default | Constraints | Description |
|---|---|---:|---|---|---|---|
| `Idempotency-Key` / `X-Idempotency-Key` (header) | string | no | opaque string | none | 8..128 chars; `[A-Za-z0-9._:-]+`; both names accepted | Optional idempotency token for dedupe/logging; echoed back as `Idempotency-Key` response header when valid. |
| `action` | string | yes | `transform` | — | — | Transform intent label. |
| `images` | file[] | yes | image files | — | MIME-validated | Inputs. |
| `rotate`,`flipH`,`flipV` | mixed | no | shared table | unset/false | shared constraints | Rotation/flip controls. |

### Action: `compress`
```bash
curl -sS -X POST "$BASE/v1/image" -H "X-Api-Key: $API_KEY" \
  -H "Idempotency-Key: idem-ext-006" \
  -F "action=compress" -F "images=@./samples/a.jpg" -F "targetSizeKB=200" -F "quality=80"
```
| Parameter | Type | Required | Accepted values / format | Default | Constraints | Description |
|---|---|---:|---|---|---|---|
| `Idempotency-Key` / `X-Idempotency-Key` (header) | string | no | opaque string | none | 8..128 chars; `[A-Za-z0-9._:-]+`; both names accepted | Optional idempotency token for dedupe/logging; echoed back as `Idempotency-Key` response header when valid. |
| `action` | string | yes | `compress` | — | — | Compression intent label. |
| `images` | file[] | yes | image files | — | MIME-validated | Inputs. |
| `targetSizeKB`,`quality`,`format` | mixed | no | shared table | unset | shared constraints | Compression targets. |

### Action: `enhance`
```bash
curl -sS -X POST "$BASE/v1/image" -H "X-Api-Key: $API_KEY" \
  -H "Idempotency-Key: idem-ext-007" \
  -F "action=enhance" -F "images=@./samples/a.jpg" -F "sharpen=1" -F "contrast=1.1"
```
| Parameter | Type | Required | Accepted values / format | Default | Constraints | Description |
|---|---|---:|---|---|---|---|
| `Idempotency-Key` / `X-Idempotency-Key` (header) | string | no | opaque string | none | 8..128 chars; `[A-Za-z0-9._:-]+`; both names accepted | Optional idempotency token for dedupe/logging; echoed back as `Idempotency-Key` response header when valid. |
| `action` | string | yes | `enhance` | — | — | Enhancement intent label. |
| `images` | file[] | yes | image files | — | MIME-validated | Inputs. |
| `blur`,`sharpen`,`brightness`,`contrast`,`saturation`,`grayscale`,`sepia` | mixed | no | shared table | varies | shared constraints | Enhancement controls. |

### Action: `padding`
```bash
curl -sS -X POST "$BASE/v1/image" -H "X-Api-Key: $API_KEY" \
  -H "Idempotency-Key: idem-ext-008" \
  -F "action=padding" -F "images=@./samples/a.jpg" -F "pad=20" -F "padColor=#ffffff"
```
| Parameter | Type | Required | Accepted values / format | Default | Constraints | Description |
|---|---|---:|---|---|---|---|
| `Idempotency-Key` / `X-Idempotency-Key` (header) | string | no | opaque string | none | 8..128 chars; `[A-Za-z0-9._:-]+`; both names accepted | Optional idempotency token for dedupe/logging; echoed back as `Idempotency-Key` response header when valid. |
| `action` | string | yes | `padding` | — | — | Padding intent label. |
| `images` | file[] | yes | image files | — | MIME-validated | Inputs. |
| `pad*`,`padColor` | mixed | no | shared table | `0`/`#ffffff` | shared constraints | Canvas extension controls. |

### Action: `frame`
```bash
curl -sS -X POST "$BASE/v1/image" -H "X-Api-Key: $API_KEY" \
  -H "Idempotency-Key: idem-ext-009" \
  -F "action=frame" -F "images=@./samples/a.jpg" -F "border=4" -F "borderColor=#000000"
```
| Parameter | Type | Required | Accepted values / format | Default | Constraints | Description |
|---|---|---:|---|---|---|---|
| `Idempotency-Key` / `X-Idempotency-Key` (header) | string | no | opaque string | none | 8..128 chars; `[A-Za-z0-9._:-]+`; both names accepted | Optional idempotency token for dedupe/logging; echoed back as `Idempotency-Key` response header when valid. |
| `action` | string | yes | `frame` | — | — | Frame intent label. |
| `images` | file[] | yes | image files | — | MIME-validated | Inputs. |
| `border`,`borderColor`,`borderRadius` | mixed | no | shared table | varies | shared constraints | Border/frame controls. |

### Action: `background`
```bash
curl -sS -X POST "$BASE/v1/image" -H "X-Api-Key: $API_KEY" \
  -H "Idempotency-Key: idem-ext-010" \
  -F "action=background" -F "images=@./samples/a.png" -F "backgroundColor=#ffffff"
```
| Parameter | Type | Required | Accepted values / format | Default | Constraints | Description |
|---|---|---:|---|---|---|---|
| `Idempotency-Key` / `X-Idempotency-Key` (header) | string | no | opaque string | none | 8..128 chars; `[A-Za-z0-9._:-]+`; both names accepted | Optional idempotency token for dedupe/logging; echoed back as `Idempotency-Key` response header when valid. |
| `action` | string | yes | `background` | — | — | Background intent label. |
| `images` | file[] | yes | image files | — | MIME-validated | Inputs. |
| `backgroundColor`,`backgroundBlur` | mixed | no | shared table | unset | shared constraints | Alpha/background controls. |

### Action: `watermark`
```bash
curl -sS -X POST "$BASE/v1/image" -H "X-Api-Key: $API_KEY" \
  -H "Idempotency-Key: idem-ext-011" \
  -F "action=watermark" -F "images=@./samples/a.jpg" -F "watermarkText=PixLab"
```
| Parameter | Type | Required | Accepted values / format | Default | Constraints | Description |
|---|---|---:|---|---|---|---|
| `Idempotency-Key` / `X-Idempotency-Key` (header) | string | no | opaque string | none | 8..128 chars; `[A-Za-z0-9._:-]+`; both names accepted | Optional idempotency token for dedupe/logging; echoed back as `Idempotency-Key` response header when valid. |
| `action` | string | yes | `watermark` | — | — | Watermark intent label. |
| `images` | file[] | yes | image files | — | MIME-validated | Inputs. |
| `watermarkText`/`watermarkImage` and watermark tuning fields | mixed | no | shared table | varies | shared constraints | Text and/or image watermarking. |

### Action: `pdf`
```bash
curl -sS -X POST "$BASE/v1/image" -H "X-Api-Key: $API_KEY" \
  -H "Idempotency-Key: idem-ext-012" \
  -F "action=pdf" -F "images=@./samples/a.jpg" -F "format=pdf" -F "pdfMode=single"
```
| Parameter | Type | Required | Accepted values / format | Default | Constraints | Description |
|---|---|---:|---|---|---|---|
| `Idempotency-Key` / `X-Idempotency-Key` (header) | string | no | opaque string | none | 8..128 chars; `[A-Za-z0-9._:-]+`; both names accepted | Optional idempotency token for dedupe/logging; echoed back as `Idempotency-Key` response header when valid. |
| `action` | string | yes | `pdf` | — | — | PDF-output intent label. |
| `images` | file[] | yes | image files | — | MIME-validated | Inputs. |
| `format` | string | no | include `pdf` | source style | must resolve to `pdf` for PDF output | Output target. |
| `pdfMode`,`pdfPageSize`,`pdfOrientation`,`pdfMargin`,`pdfEmbedFormat`,`pdfJpegQuality` | mixed | no | shared table | varies | shared constraints | PDF rendering controls. |

### Action: `metadata`
```bash
curl -sS -X POST "$BASE/v1/image" -H "X-Api-Key: $API_KEY" \
  -H "Idempotency-Key: idem-ext-013" \
  -F "action=metadata" -F "images=@./samples/a.jpg" -F "normalizeOrientation=true" -F "includeRawExif=true"
```
| Parameter | Type | Required | Accepted values / format | Default | Constraints | Description |
|---|---|---:|---|---|---|---|
| `Idempotency-Key` / `X-Idempotency-Key` (header) | string | no | opaque string | none | 8..128 chars; `[A-Za-z0-9._:-]+`; both names accepted | Optional idempotency token for dedupe/logging; echoed back as `Idempotency-Key` response header when valid. |
| `action` | string | yes | `metadata` | — | — | Metadata-only mode (no transform output URLs). |
| `images` | file[] | yes | image files | — | MIME-validated | Inputs. |
| `normalizeOrientation`,`includeRawExif` | bool/string | no | true/false | false | shared constraints | Metadata response controls. |

### Action: `multitask`
```bash
curl -sS -X POST "$BASE/v1/image" -H "X-Api-Key: $API_KEY" \
  -H "Idempotency-Key: idem-ext-014" \
  -F "action=multitask" -F "images=@./samples/a.jpg" -F "width=1200" -F "format=webp" -F "watermarkText=PixLab"
```
| Parameter | Type | Required | Accepted values / format | Default | Constraints | Description |
|---|---|---:|---|---|---|---|
| `Idempotency-Key` / `X-Idempotency-Key` (header) | string | no | opaque string | none | 8..128 chars; `[A-Za-z0-9._:-]+`; both names accepted | Optional idempotency token for dedupe/logging; echoed back as `Idempotency-Key` response header when valid. |
| `action` | string | yes | `multitask` | — | — | Label only; implementation uses shared pipeline fields. |
| `images` | file[] | yes | image files | — | MIME-validated | Inputs. |
| Any shared transform fields | mixed | no | shared table | varies | shared constraints | Compose multiple effects in one request. |

---

## Endpoint: `POST /v1/pdf` (multipart form-data)

Supported actions: `merge`, `to-images`, `compress`, `extract-images`, `watermark`, `rotate`, `metadata`, `reorder`, `delete-pages`, `extract`, `flatten`, `encrypt`, `decrypt`, `split`.

Shared fields:
- `action` (required)
- `files` upload(s), MIME must be `application/pdf`
- `watermarkImage` upload is used by `action=watermark`

### Action: `merge`
```bash
curl -sS -X POST "$BASE/v1/pdf" -H "X-Api-Key: $API_KEY" \
  -H "Idempotency-Key: idem-ext-015" \
  -F "action=merge" -F "files=@./samples/one.pdf" -F "files=@./samples/two.pdf" -F "sortByName=true"
```
| Parameter | Type | Required | Accepted values / format | Default | Constraints | Description |
|---|---|---:|---|---|---|---|
| `Idempotency-Key` / `X-Idempotency-Key` (header) | string | no | opaque string | none | 8..128 chars; `[A-Za-z0-9._:-]+`; both names accepted | Optional idempotency token for dedupe/logging; echoed back as `Idempotency-Key` response header when valid. |
| `files` | file[] | yes | 1+ PDF files | — | MIME `application/pdf` | PDFs to merge. |
| `sortByName` | bool/string | no | true/false | false | exact `'true'` in parsing path | Optional filename sort before merge. |

### Action: `to-images`
```bash
curl -sS -X POST "$BASE/v1/pdf" -H "X-Api-Key: $API_KEY" \
  -H "Idempotency-Key: idem-ext-016" \
  -F "action=to-images" -F "files=@./samples/doc.pdf" -F "pages=1-3" -F "toFormat=png" -F "dpi=180" -F "width=1600" -F "height=2200"
```
| Parameter | Type | Required | Accepted values / format | Default | Constraints | Description |
|---|---|---:|---|---|---|---|
| `Idempotency-Key` / `X-Idempotency-Key` (header) | string | no | opaque string | none | 8..128 chars; `[A-Za-z0-9._:-]+`; both names accepted | Optional idempotency token for dedupe/logging; echoed back as `Idempotency-Key` response header when valid. |
| `files` | file | yes | one PDF | — | first file used | Source PDF. |
| `pages` | string | no | `all`,`first`,`1,3`,`1-5` | `all` | invalid/empty resolves to page 1 fallback | Page selector. |
| `toFormat` | string | no | `png`,`jpeg`,`jpg`,`webp` | `png` | `jpg` -> `jpeg` | Output image format. |
| `dpi` | int | no | parseInt | `150` | clamp `36..600` | Rasterization DPI. |
| `width`,`height` | int | no | parseInt | unset | optional resize after render | Output dimensions. |

### Action: `compress`
```bash
curl -sS -X POST "$BASE/v1/pdf" -H "X-Api-Key: $API_KEY" -F "action=compress" -F "files=@./samples/doc.pdf" -H "Idempotency-Key: idem-ext-017"
```
| Parameter | Type | Required | Description |
|---|---|---:|---|
| `Idempotency-Key` / `X-Idempotency-Key` (header) | string | no | Optional, 8..128 chars (`[A-Za-z0-9._:-]+`); both names accepted; echoed as `Idempotency-Key` response header. |
| `files` | file | yes | Single source PDF (first file used). |

### Action: `extract-images`
```bash
curl -sS -X POST "$BASE/v1/pdf" -H "X-Api-Key: $API_KEY" \
  -H "Idempotency-Key: idem-ext-018" \
  -F "action=extract-images" -F "files=@./samples/doc.pdf" -F "pages=all" -F "imageFormat=jpeg"
```
| Parameter | Type | Required | Accepted values / format | Default | Constraints | Description |
|---|---|---:|---|---|---|---|
| `Idempotency-Key` / `X-Idempotency-Key` (header) | string | no | opaque string | none | 8..128 chars; `[A-Za-z0-9._:-]+`; both names accepted | Optional idempotency token for dedupe/logging; echoed back as `Idempotency-Key` response header when valid. |
| `files` | file | yes | one PDF | — | first file used | Source PDF. |
| `pages` | string | no | same as `to-images` | `all` | same parser | Page selector. |
| `imageFormat` | string | no | `png`,`jpeg`,`jpg`,`webp` | `png` | passed as `toFormat` internally | Output image format. |

### Action: `watermark`
```bash
curl -sS -X POST "$BASE/v1/pdf" -H "X-Api-Key: $API_KEY" \
  -H "Idempotency-Key: idem-ext-019" \
  -F "action=watermark" -F "files=@./samples/doc.pdf" -F "watermarkText=CONFIDENTIAL" -F "opacity=0.3" -F "position=center"
```
| Parameter | Type | Required | Accepted values / format | Default | Constraints | Description |
|---|---|---:|---|---|---|---|
| `Idempotency-Key` / `X-Idempotency-Key` (header) | string | no | opaque string | none | 8..128 chars; `[A-Za-z0-9._:-]+`; both names accepted | Optional idempotency token for dedupe/logging; echoed back as `Idempotency-Key` response header when valid. |
| `files` | file | yes | one PDF | — | first file used | Source PDF. |
| `watermarkText` | string | conditional | text | unset | required unless `watermarkImage` is uploaded | Text watermark. |
| `watermarkImage` | file | conditional | image file | unset | required unless `watermarkText` present | Image watermark. |
| `pages` | string | no | page selector | `all` | parser as above | Target pages. |
| `opacity` | number | no | numeric | `0.3` | clamp `0..1` | Watermark alpha. |
| `margin` | int | no | parseInt | `24` | clamp `0..5000` | Position margin. |
| `position` | string | no | center/top/bottom/left/right/corners | `center` | invalid -> center | Placement. |
| `fontSize` | int | no | parseInt | `24` | clamp `1..400` | Text size. |
| `color` | hex string | no | `#rrggbb`/`#rgb` | `#000000` | parse fallback black | Text color. |
| `watermarkScale` | number | no | numeric | `0.25` | clamp `0.01..1` | Image watermark scale factor. |

### Action: `rotate`
```bash
curl -sS -X POST "$BASE/v1/pdf" -H "X-Api-Key: $API_KEY" -F "action=rotate" -F "files=@./samples/doc.pdf" -F "degrees=90" -F "pages=1,2" -H "Idempotency-Key: idem-ext-020"
```
| Parameter | Type | Required | Accepted values / format | Default | Constraints | Description |
|---|---|---:|---|---|---|---|
| `Idempotency-Key` / `X-Idempotency-Key` (header) | string | no | opaque string | none | 8..128 chars; `[A-Za-z0-9._:-]+`; both names accepted | Optional idempotency token for dedupe/logging; echoed back as `Idempotency-Key` response header when valid. |
| `files` | file | yes | one PDF | — | first file used | Source PDF. |
| `degrees` | int | no | parseInt | `90` | rounded to nearest multiple of 90 and normalized | Rotation angle. |
| `pages` | string | no | page selector | `all` | parser as above | Target pages. |

### Action: `metadata`
```bash
curl -sS -X POST "$BASE/v1/pdf" -H "X-Api-Key: $API_KEY" -F "action=metadata" -F "files=@./samples/doc.pdf" -F "title=Updated" -H "Idempotency-Key: idem-ext-021"
```
| Parameter | Type | Required | Accepted values / format | Default | Description |
|---|---|---:|---|---|---|
| `Idempotency-Key` / `X-Idempotency-Key` (header) | string | no | opaque string | none | 8..128 chars; `[A-Za-z0-9._:-]+`; both names accepted; echoed as `Idempotency-Key` response header. |
| `files` | file | yes | one PDF | — | Source PDF. |
| `cleanAllMetadata` | bool/string | no | true/false | false | Clears common metadata fields before optional updates. |
| `title`,`author`,`subject`,`keywords`,`creator`,`producer` | string | no | text | unset | Optional metadata updates. |

### Action: `reorder`
```bash
curl -sS -X POST "$BASE/v1/pdf" -H "X-Api-Key: $API_KEY" -F "action=reorder" -F "files=@./samples/doc.pdf" -F 'order=[3,1,2]' -H "Idempotency-Key: idem-ext-022"
```
| Parameter | Type | Required | Accepted values / format | Constraints | Description |
|---|---|---:|---|---|---|
| `Idempotency-Key` / `X-Idempotency-Key` (header) | string | no | opaque string | none | 8..128 chars; `[A-Za-z0-9._:-]+`; both names accepted; echoed as `Idempotency-Key` response header. |
| `files` | file | yes | one PDF | first file used | Source PDF. |
| `order` | JSON string array | yes | e.g. `[3,1,2]` | must be full 1-based permutation of all pages | New page order. |

### Action: `delete-pages`
```bash
curl -sS -X POST "$BASE/v1/pdf" -H "X-Api-Key: $API_KEY" -F "action=delete-pages" -F "files=@./samples/doc.pdf" -F "pages=2-4" -H "Idempotency-Key: idem-ext-023"
```
| Parameter | Type | Required | Accepted values / format | Constraints | Description |
|---|---|---:|---|---|---|
| `Idempotency-Key` / `X-Idempotency-Key` (header) | string | no | opaque string | none | 8..128 chars; `[A-Za-z0-9._:-]+`; both names accepted; echoed as `Idempotency-Key` response header. |
| `files` | file | yes | one PDF | first file used | Source PDF. |
| `pages` | string | no | page selector | cannot delete all pages | Pages to remove. |

### Action: `extract`
```bash
curl -sS -X POST "$BASE/v1/pdf" -H "X-Api-Key: $API_KEY" -F "action=extract" -F "files=@./samples/doc.pdf" -F "pages=5-8" -F "mode=single" -H "Idempotency-Key: idem-ext-024"
```
| Parameter | Type | Required | Accepted values / format | Default | Constraints | Description |
|---|---|---:|---|---|---|---|
| `Idempotency-Key` / `X-Idempotency-Key` (header) | string | no | opaque string | none | 8..128 chars; `[A-Za-z0-9._:-]+`; both names accepted | Optional idempotency token for dedupe/logging; echoed back as `Idempotency-Key` response header when valid. |
| `files` | file | yes | one PDF | — | first file used | Source PDF. |
| `pages` | string | no | page selector | `all` | parser as above | Pages to extract. |
| `mode` | string | no | `single`,`multiple` | `single` | only exact `multiple` enables per-page outputs | Output grouping mode. |

### Action: `flatten`
```bash
curl -sS -X POST "$BASE/v1/pdf" -H "X-Api-Key: $API_KEY" -F "action=flatten" -F "files=@./samples/doc.pdf" -F "flattenForms=true" -H "Idempotency-Key: idem-ext-025"
```
| Parameter | Type | Required | Accepted values / format | Default | Description |
|---|---|---:|---|---|---|
| `Idempotency-Key` / `X-Idempotency-Key` (header) | string | no | opaque string | none | 8..128 chars; `[A-Za-z0-9._:-]+`; both names accepted; echoed as `Idempotency-Key` response header. |
| `files` | file | yes | one PDF | — | Source PDF. |
| `flattenForms` | bool/string | no | true/false | true | Form flatten toggle. |

### Action: `encrypt`
```bash
curl -sS -X POST "$BASE/v1/pdf" -H "X-Api-Key: $API_KEY" -F "action=encrypt" -F "files=@./samples/doc.pdf" -F "userPassword=userpass" -F "ownerPassword=ownerpass" -H "Idempotency-Key: idem-ext-026"
```
| Parameter | Type | Required | Accepted values / format | Default | Constraints | Description |
|---|---|---:|---|---|---|---|
| `Idempotency-Key` / `X-Idempotency-Key` (header) | string | no | opaque string | none | 8..128 chars; `[A-Za-z0-9._:-]+`; both names accepted | Optional idempotency token for dedupe/logging; echoed back as `Idempotency-Key` response header when valid. |
| `files` | file | yes | one PDF | — | first file used | Source PDF. |
| `userPassword` | string | yes | text | — | required | User password. |
| `ownerPassword` | string | no | text | same as `userPassword` | — | Owner password. |

### Action: `decrypt`
```bash
curl -sS -X POST "$BASE/v1/pdf" -H "X-Api-Key: $API_KEY" -F "action=decrypt" -F "files=@./samples/locked.pdf" -F "password=userpass" -H "Idempotency-Key: idem-ext-027"
```
| Parameter | Type | Required | Accepted values / format | Constraints | Description |
|---|---|---:|---|---|---|
| `Idempotency-Key` / `X-Idempotency-Key` (header) | string | no | opaque string | none | 8..128 chars; `[A-Za-z0-9._:-]+`; both names accepted; echoed as `Idempotency-Key` response header. |
| `files` | file | yes | one PDF | first file used | Source PDF. |
| `password` | string | yes | text | required | Decryption password. |

### Action: `split`
```bash
curl -sS -X POST "$BASE/v1/pdf" -H "X-Api-Key: $API_KEY" -F "action=split" -F "files=@./samples/doc.pdf" -F "ranges=1-2,3-5" -F "prefix=chapter_" -H "Idempotency-Key: idem-ext-028"
```
| Parameter | Type | Required | Accepted values / format | Default | Constraints | Description |
|---|---|---:|---|---|---|---|
| `Idempotency-Key` / `X-Idempotency-Key` (header) | string | no | opaque string | none | 8..128 chars; `[A-Za-z0-9._:-]+`; both names accepted | Optional idempotency token for dedupe/logging; echoed back as `Idempotency-Key` response header when valid. |
| `files` | file | yes | one PDF | — | first file used | Source PDF. |
| `ranges` | string | yes | comma-delimited ranges | — | missing -> error | Split ranges. |
| `prefix` | string | no | text | `split_` | used as filename prefix | Output naming prefix. |

---

## Endpoint: `POST /v1/tools` (multipart form-data)

Top-level `action` values are `single` and `multitask`, but tooling is controlled by `tools` list values.

Shared fields:
- `action` (required)
- `images` files (at least one)
- `tools` or `tools[]` (comma-separated or repeated values)

Supported tool names implemented in code: `metadata`, `colors`, `detect-format`, `orientation`, `hash`, `similarity`, `dimensions`, `palette`, `transparency`, `quality`, `efficiency`.

### Tools endpoint — single — `tool=metadata`
```bash
curl -sS -X POST "$BASE/v1/tools" -H "X-Api-Key: $API_KEY" \
  -H "Idempotency-Key: idem-ext-029" \
  -F "action=single" -F "tools=metadata" -F "images=@./samples/a.jpg" -F "includeRawExif=true"
```
| Parameter | Type | Required | Accepted values / format | Default | Constraints | Description |
|---|---|---:|---|---|---|---|
| `Idempotency-Key` / `X-Idempotency-Key` (header) | string | no | opaque string | none | 8..128 chars; `[A-Za-z0-9._:-]+`; both names accepted | Optional idempotency token for dedupe/logging; echoed back as `Idempotency-Key` response header when valid. |
| `action` | string | yes | `single` | — | requires exactly one tool | Single-tool mode. |
| `tools` | string | yes | `metadata` | — | one tool only in single mode | Selected tool. |
| `images` | file[] | yes | image files | — | MIME-validated | Inputs. |
| `includeRawExif` | bool/string | no | true/false | false | string `'true'` check | Include raw EXIF object. |

### Tools endpoint — single — `tool=colors`
```bash
curl -sS -X POST "$BASE/v1/tools" -H "X-Api-Key: $API_KEY" -F "action=single" -F "tools=colors" -F "images=@./samples/a.jpg" -H "Idempotency-Key: idem-ext-030"
```
| Parameter | Type | Required | Description |
|---|---|---:|---|
| `Idempotency-Key` / `X-Idempotency-Key` (header) | string | no | Optional, 8..128 chars (`[A-Za-z0-9._:-]+`); both names accepted; echoed as `Idempotency-Key` response header. |
| `action`,`tools`,`images` | mixed | yes | Returns dominant + palette sample from image colors. |

### Tools endpoint — single — `tool=detect-format`
```bash
curl -sS -X POST "$BASE/v1/tools" -H "X-Api-Key: $API_KEY" -F "action=single" -F "tools=detect-format" -F "images=@./samples/a.jpg" -H "Idempotency-Key: idem-ext-031"
```
| Parameter | Type | Required | Description |
|---|---|---:|---|
| `Idempotency-Key` / `X-Idempotency-Key` (header) | string | no | Optional, 8..128 chars (`[A-Za-z0-9._:-]+`); both names accepted; echoed as `Idempotency-Key` response header. |
| `action`,`tools`,`images` | mixed | yes | Returns detected format and MIME. |

### Tools endpoint — single — `tool=orientation`
```bash
curl -sS -X POST "$BASE/v1/tools" -H "X-Api-Key: $API_KEY" -F "action=single" -F "tools=orientation" -F "images=@./samples/a.jpg" -H "Idempotency-Key: idem-ext-032"
```
| Parameter | Type | Required | Description |
|---|---|---:|---|
| `Idempotency-Key` / `X-Idempotency-Key` (header) | string | no | Optional, 8..128 chars (`[A-Za-z0-9._:-]+`); both names accepted; echoed as `Idempotency-Key` response header. |
| `action`,`tools`,`images` | mixed | yes | Returns orientation flags/classification. |

### Tools endpoint — single — `tool=hash`
```bash
curl -sS -X POST "$BASE/v1/tools" -H "X-Api-Key: $API_KEY" -F "action=single" -F "tools=hash" -F "images=@./samples/a.jpg" -F "hashType=sha256" -H "Idempotency-Key: idem-ext-033"
```
| Parameter | Type | Required | Accepted values / format | Default | Constraints | Description |
|---|---|---:|---|---|---|---|
| `Idempotency-Key` / `X-Idempotency-Key` (header) | string | no | opaque string | none | 8..128 chars; `[A-Za-z0-9._:-]+`; both names accepted | Optional idempotency token for dedupe/logging; echoed back as `Idempotency-Key` response header when valid. |
| `hashType` | string | no | `phash`,`md5`,`sha1`,`sha256` | `phash` | unknown -> `phash` | Hash algorithm. |

### Tools endpoint — single — `tool=similarity`
```bash
curl -sS -X POST "$BASE/v1/tools" -H "X-Api-Key: $API_KEY" \
  -H "Idempotency-Key: idem-ext-034" \
  -F "action=single" -F "tools=similarity" -F "images=@./samples/a.jpg" -F "images=@./samples/b.jpg" -F "similarityMode=pairs" -F "similarityThreshold=8"
```
| Parameter | Type | Required | Accepted values / format | Default | Constraints | Description |
|---|---|---:|---|---|---|---|
| `Idempotency-Key` / `X-Idempotency-Key` (header) | string | no | opaque string | none | 8..128 chars; `[A-Za-z0-9._:-]+`; both names accepted | Optional idempotency token for dedupe/logging; echoed back as `Idempotency-Key` response header when valid. |
| `similarityMode` | string | no | `pairs`,`toFirst` | `pairs` | parser normalizes `tofirst` | Pairwise vs compare-to-first output. |
| `similarityThreshold` | int | no | parseInt | `8` | clamp `0..64` | Similarity cutoff. |
| `images` | file[] | yes | image files | — | `pairs` mode max 25 images | Similarity inputs. |

### Tools endpoint — single — `tool=dimensions`
```bash
curl -sS -X POST "$BASE/v1/tools" -H "X-Api-Key: $API_KEY" -F "action=single" -F "tools=dimensions" -F "images=@./samples/a.jpg" -H "Idempotency-Key: idem-ext-035"
```
| Parameter | Type | Required | Description |
|---|---|---:|---|
| `Idempotency-Key` / `X-Idempotency-Key` (header) | string | no | Optional, 8..128 chars (`[A-Za-z0-9._:-]+`); both names accepted; echoed as `Idempotency-Key` response header. |
| `action`,`tools`,`images` | mixed | yes | Returns width/height/aspect/orientation class. |

### Tools endpoint — single — `tool=palette`
```bash
curl -sS -X POST "$BASE/v1/tools" -H "X-Api-Key: $API_KEY" -F "action=single" -F "tools=palette" -F "images=@./samples/a.jpg" -F "paletteSize=8" -H "Idempotency-Key: idem-ext-036"
```
| Parameter | Type | Required | Accepted values / format | Default | Constraints | Description |
|---|---|---:|---|---|---|---|
| `Idempotency-Key` / `X-Idempotency-Key` (header) | string | no | opaque string | none | 8..128 chars; `[A-Za-z0-9._:-]+`; both names accepted | Optional idempotency token for dedupe/logging; echoed back as `Idempotency-Key` response header when valid. |
| `paletteSize` | int | no | parseInt | `5` | clamp `1..16` | Number of palette colors. |

### Tools endpoint — single — `tool=transparency`
```bash
curl -sS -X POST "$BASE/v1/tools" -H "X-Api-Key: $API_KEY" -F "action=single" -F "tools=transparency" -F "images=@./samples/a.png" -F "transparencySample=64" -H "Idempotency-Key: idem-ext-037"
```
| Parameter | Type | Required | Accepted values / format | Default | Constraints | Description |
|---|---|---:|---|---|---|---|
| `Idempotency-Key` / `X-Idempotency-Key` (header) | string | no | opaque string | none | 8..128 chars; `[A-Za-z0-9._:-]+`; both names accepted | Optional idempotency token for dedupe/logging; echoed back as `Idempotency-Key` response header when valid. |
| `transparencySample` | int | no | parseInt | `64` | clamp `16..128` | Sampling resolution for transparency estimate. |

### Tools endpoint — single — `tool=quality`
```bash
curl -sS -X POST "$BASE/v1/tools" -H "X-Api-Key: $API_KEY" -F "action=single" -F "tools=quality" -F "images=@./samples/a.jpg" -F "qualitySample=256" -H "Idempotency-Key: idem-ext-038"
```
| Parameter | Type | Required | Accepted values / format | Default | Constraints | Description |
|---|---|---:|---|---|---|---|
| `Idempotency-Key` / `X-Idempotency-Key` (header) | string | no | opaque string | none | 8..128 chars; `[A-Za-z0-9._:-]+`; both names accepted | Optional idempotency token for dedupe/logging; echoed back as `Idempotency-Key` response header when valid. |
| `qualitySample` | int | no | parseInt | `256` | clamp `64..512` | Sampling size for sharpness score. |

### Tools endpoint — single — `tool=efficiency`
```bash
curl -sS -X POST "$BASE/v1/tools" -H "X-Api-Key: $API_KEY" \
  -H "Idempotency-Key: idem-ext-039" \
  -F "action=single" -F "tools=efficiency" -F "images=@./samples/a.jpg" -F "efficiencyFormat=webp" -F "efficiencyQuality=80"
```
| Parameter | Type | Required | Accepted values / format | Default | Constraints | Description |
|---|---|---:|---|---|---|---|
| `Idempotency-Key` / `X-Idempotency-Key` (header) | string | no | opaque string | none | 8..128 chars; `[A-Za-z0-9._:-]+`; both names accepted | Optional idempotency token for dedupe/logging; echoed back as `Idempotency-Key` response header when valid. |
| `efficiencyFormat` | string | no | `jpeg`,`jpg`,`png`,`webp`,`avif` | unset | unsupported -> null estimate fields | Target format for size estimate. |
| `efficiencyQuality` | int | no | parseInt | `80` | clamp `1..100` (for jpeg/webp/avif) | Quality for estimate. |

### Tools endpoint — multitask (multi-tool in one request)
```bash
curl -sS -X POST "$BASE/v1/tools" -H "X-Api-Key: $API_KEY" \
  -H "Idempotency-Key: idem-ext-040" \
  -F "action=multitask" \
  -F "tools=metadata,dimensions,hash,similarity,quality" \
  -F "images=@./samples/a.jpg" \
  -F "images=@./samples/b.jpg" \
  -F "hashType=phash" \
  -F "similarityMode=toFirst" \
  -F "similarityThreshold=10" \
  -F "qualitySample=256"
```
| Parameter | Type | Required | Accepted values / format | Default | Range / enum / constraints | Description |
|---|---|---:|---|---|---|---|
| `Idempotency-Key` / `X-Idempotency-Key` (header) | string | no | opaque string | none | 8..128 chars; `[A-Za-z0-9._:-]+`; both names accepted | Optional idempotency token for dedupe/logging; echoed back as `Idempotency-Key` response header when valid. |
| `action` | string | yes | `multitask` | — | multiple tools allowed | Multi-tool mode. |
| `tools` / `tools[]` | string/list | yes | comma-separated tool names | — | unknown names are ignored (no dedicated error) | Tool set for each image. |
| `images` | file[] | yes | image files | — | MIME-validated | Inputs. |
| Tool-specific params | mixed | no | fields above | varies | each uses same clamp/default rules as single mode | Applied when corresponding tool is requested. |

Notes:
- Multitask payload structure is flat form-data (`tools` list + optional per-tool fields); there is no nested `tasks[]` JSON object structure in the implementation.

---

## Supplemental verified notes merged from previous external cURL doc

- Success payloads that return generated files include signed URLs built by `buildSignedUrl(...)` and served behind `signedStaticGuard()` on `/h2i`, `/image`, `/pdf`, and `/tools` (when tools static serving is enabled).
- When `REQUIRE_SIGNED_OUTPUT_URLS=true`, static downloads require both `exp` and `sig`; expired or bad signatures fail with `expired` / `invalid_signature`.
- Public-key traffic on `/v1/h2i`, `/v1/image`, `/v1/pdf`, and `/v1/tools` is subject to per-day limits; customer keys are enforced via monthly quota reservation/finalization.
- Concurrency limits exist per endpoint; timeout waiting for a worker slot returns `server_busy`.
