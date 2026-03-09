# 14) External API cURL Examples (`/v1/*`)

> Source of truth for this file: `routes/h2i-route.js`, `routes/image-route.js`, `routes/pdf-route.js`, and `routes/tools-route.js`.

## Setup

```bash
BASE="https://api.example.com"
API_KEY="pk_live_xxx"
```

All calls require `X-Api-Key` and support `Idempotency-Key`.

---

## `POST /v1/h2i`

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

| Parameter | Type | Required | Accepted values / format | Default | Constraints / behavior |
|---|---|---:|---|---|---|
| `action` | string | yes | `image` | — | Must be `image` or `pdf`. |
| `html` | string | yes | HTML string | — | Enforced max length by plan/server limits. |
| `css` | string | no | CSS string | empty | Injected into `<style>` wrapper when set. |
| `width` | integer | no | positive integer | `1000` | Clamped to `[1..maxRenderWidth]`. |
| `height` | integer | no | positive integer | `1500` | Clamped to `[1..maxRenderHeight]`. |
| `format` | string | no | `png`,`jpeg`,`jpg` | `png` | Non-jpeg values are effectively PNG for screenshots. |

### Action: `pdf`

```bash
curl -sS -X POST "$BASE/v1/h2i" \
  -H "X-Api-Key: $API_KEY" \
  -H "Idempotency-Key: h2i-pdf-001" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "pdf",
    "html": "<h1>Invoice</h1>",
    "css": "body{font-family:sans-serif}",
    "width": 1000,
    "height": 1500,
    "pdfFormat": "A4",
    "pdfLandscape": false,
    "pdfMargin": 24,
    "preferCSSPageSize": true,
    "scale": 1,
    "printMode": false,
    "printBackground": true
  }'
```

| Parameter | Type | Required | Accepted values / format | Default | Constraints / behavior |
|---|---|---:|---|---|---|
| `action` | string | yes | `pdf` | — | Must be `image` or `pdf`. |
| `html`,`css`,`width`,`height` | mixed | same as `image` | see above | see above | Same input parsing as `action=image`. |
| `pdfFormat` | string | no | `A4` or `LETTER` | `A4` | `LETTER` (case-insensitive) maps to `Letter`. |
| `pdfLandscape` | boolean/string | no | `true`/`false` | `false` | String booleans accepted. |
| `pdfMargin` | integer | no | integer px | `24` | Applied to all PDF sides. |
| `preferCSSPageSize` | boolean/string | no | `true`/`false` | `true` | Passed to Puppeteer PDF options. |
| `scale` | number | no | numeric | `1` | Passed directly to Puppeteer. |
| `printMode` | boolean/string | no | `true`/`false` | `false` | Enables `page.emulateMediaType('print')`. |
| `printBackground` | boolean/string | no | `true`/`false` | `true` | Include CSS backgrounds in PDF. |

---

## `POST /v1/image`

All actions are multipart form-data with `images=@...` files.

### Action: `format` (same operation engine as `resize`, `crop`, `transform`, `compress`, `enhance`, `padding`, `frame`, `background`, `watermark`, `pdf`, `multitask`)

```bash
curl -sS -X POST "$BASE/v1/image" \
  -H "X-Api-Key: $API_KEY" \
  -H "Idempotency-Key: image-format-001" \
  -F "action=format" \
  -F "images=@./samples/a.jpg" \
  -F "images=@./samples/b.png" \
  -F "watermarkImage=@./samples/wm.png" \
  -F "format=webp" \
  -F "width=1200" -F "height=1200" -F "enlarge=false" \
  -F "cropX=10" -F "cropY=20" -F "cropWidth=800" -F "cropHeight=800" \
  -F "rotate=90" -F "flipH=true" -F "flipV=false" \
  -F "targetSizeKB=200" -F "quality=82" -F "keepMetadata=true" \
  -F "normalizeOrientation=true" -F "colorSpace=srgb" \
  -F "blur=0.8" -F "sharpen=1.1" -F "brightness=1.0" -F "contrast=1.0" -F "saturation=1.0" \
  -F "pad=0" -F "padTop=12" -F "padRight=12" -F "padBottom=12" -F "padLeft=12" -F "padColor=#ffffff" \
  -F "border=2" -F "borderColor=#000000" -F "borderRadius=12" \
  -F "backgroundColor=#ffffff" -F "backgroundBlur=0" \
  -F "watermarkText=PixLab" -F "watermarkFontSize=42" -F "watermarkColor=#ffffff" \
  -F "watermarkOpacity=0.35" -F "watermarkPosition=center" -F "watermarkMargin=24" -F "watermarkScale=0.25" \
  -F "pdfMode=single" -F "pdfPageSize=auto" -F "pdfOrientation=portrait" -F "pdfMargin=0" \
  -F "pdfEmbedFormat=jpeg" -F "pdfJpegQuality=85"
```

### Action: `metadata`

```bash
curl -sS -X POST "$BASE/v1/image" \
  -H "X-Api-Key: $API_KEY" \
  -H "Idempotency-Key: image-meta-001" \
  -F "action=metadata" \
  -F "images=@./samples/a.jpg" \
  -F "normalizeOrientation=true" \
  -F "includeRawExif=true"
```

**Supported actions:** `format`, `resize`, `crop`, `transform`, `compress`, `enhance`, `padding`, `frame`, `background`, `watermark`, `pdf`, `metadata`, `multitask`.

| Parameter | Type | Required | Accepted values / format | Default | Constraints / behavior |
|---|---|---:|---|---|---|
| `action` | string | yes | list above | — | `metadata` returns analysis only; other actions run transform pipeline. |
| `images` | file[] | yes | image files | — | Allowed MIME: jpeg/png/webp/gif/avif/svg. |
| `watermarkImage` | file | no | image file | none | Used only when compositing watermark image. |
| `format` | string | no | `jpeg`,`jpg`,`png`,`webp`,`avif`,`gif`,`svg`,`pdf` | keep source / jpeg fallback | `pdf` triggers PDF output mode. |
| `width`,`height` | integer | no | positive ints | none | Resize fit=`inside`; no enlarge unless `enlarge=true`. |
| `enlarge` | boolean/string | no | true/false | false | Allows upscaling during resize. |
| `cropX`,`cropY`,`cropWidth`,`cropHeight` | integer | no | all 4 required together | none | Applies extract crop before resize. |
| `rotate` | integer | no | numeric degrees | none | Sharp rotate. |
| `flipH`,`flipV` | boolean/string | no | true/false | false | Horizontal/vertical flips. |
| `targetSizeKB` | integer | no | positive int | none | Binary search quality target (lossy formats). |
| `quality` | integer | no | int | none | Encoding quality when format supports quality. |
| `keepMetadata` | boolean/string | no | true/false | false | Preserves metadata in output. |
| `normalizeOrientation` | boolean/string | no | true/false | false | Auto-rotates from EXIF orientation. |
| `blur` | number | no | numeric | none | Clamped `0..500`. |
| `sharpen` | number/bool | no | numeric / true | none | Clamped `0..10`; `true` => default sharpen. |
| `grayscale` | boolean/string | no | true/false | false | Converts output grayscale. |
| `sepia` | boolean/string | no | true/false | false | Applies recombination matrix. |
| `brightness`,`contrast`,`saturation` | number | no | numeric | `1` | Each clamped `0..2`. |
| `pad` / `padTop`/`padRight`/`padBottom`/`padLeft` | integer | no | non-negative ints | `0` | `pad` overrides side-specific values. |
| `padColor` | string | no | color string | `#ffffff` | Padding fill color. |
| `border` | integer | no | non-negative int | `0` | Uniform border thickness. |
| `borderColor` | string | no | color string | `#000000` | Border color. |
| `borderRadius` | integer | no | non-negative int | `0` | Rounded mask radius. |
| `backgroundColor` | string | no | color string | none | Flattens alpha background. |
| `backgroundBlur` | number | no | numeric | none | Clamped `0..200`; applied before flatten. |
| `watermarkText` | string | no | free text | none | Text watermark. |
| `watermarkFontSize` | int | no | int | `32` | Clamped `6..400`. |
| `watermarkColor` | string | no | color string | `#ffffff` | Text color. |
| `watermarkOpacity` | number | no | numeric | `0.35` | Clamped `0..1` for text/image watermark. |
| `watermarkPosition` | string | no | Sharp gravity string | `center` | Placement for watermark overlays. |
| `watermarkMargin` | int | no | int | `24` | Clamped `0..5000`. |
| `watermarkScale` | number | no | numeric | `0.25` | Clamped `0.01..1` for image watermark size. |
| `colorSpace` | string | no | `srgb`,`grayscale`,`cmyk` | `srgb` | `cmyk` may fail depending on build. |
| `pdfMode` | string | no | `single`,`multi` | `single` | Used only when output `format=pdf`. |
| `pdfPageSize` | string | no | `auto`,`a4`,`letter` | `auto` | With `multi`, controls each page size. |
| `pdfOrientation` | string | no | `portrait`,`landscape` | `portrait` | Used with fixed page sizes. |
| `pdfMargin` | integer | no | int | `0` | PDF margins (points). |
| `pdfEmbedFormat` | string | no | `png`,`jpeg`,`jpg` | `png` | Embed format used in PDF generation. |
| `pdfJpegQuality` | integer | no | int | `85` | Clamped `20..100`. |
| `includeRawExif` | boolean/string | no | true/false | false | Only meaningful for `action=metadata`. |

### Action-specific quick cURL calls (image endpoint)

The following actions are all supported and use the same transformation parameter surface shown above (except `metadata`, which is metadata-only):

```bash
curl -sS -X POST "$BASE/v1/image" -H "X-Api-Key: $API_KEY" -F "action=resize" -F "images=@./samples/a.jpg" -F "width=1024" -F "height=768"
curl -sS -X POST "$BASE/v1/image" -H "X-Api-Key: $API_KEY" -F "action=crop" -F "images=@./samples/a.jpg" -F "cropX=0" -F "cropY=0" -F "cropWidth=800" -F "cropHeight=600"
curl -sS -X POST "$BASE/v1/image" -H "X-Api-Key: $API_KEY" -F "action=transform" -F "images=@./samples/a.jpg" -F "rotate=90" -F "flipH=true"
curl -sS -X POST "$BASE/v1/image" -H "X-Api-Key: $API_KEY" -F "action=compress" -F "images=@./samples/a.jpg" -F "targetSizeKB=200"
curl -sS -X POST "$BASE/v1/image" -H "X-Api-Key: $API_KEY" -F "action=enhance" -F "images=@./samples/a.jpg" -F "sharpen=1.1" -F "contrast=1.1"
curl -sS -X POST "$BASE/v1/image" -H "X-Api-Key: $API_KEY" -F "action=padding" -F "images=@./samples/a.jpg" -F "pad=20" -F "padColor=#ffffff"
curl -sS -X POST "$BASE/v1/image" -H "X-Api-Key: $API_KEY" -F "action=frame" -F "images=@./samples/a.jpg" -F "border=4" -F "borderColor=#000000"
curl -sS -X POST "$BASE/v1/image" -H "X-Api-Key: $API_KEY" -F "action=background" -F "images=@./samples/a.png" -F "backgroundColor=#ffffff"
curl -sS -X POST "$BASE/v1/image" -H "X-Api-Key: $API_KEY" -F "action=watermark" -F "images=@./samples/a.jpg" -F "watermarkText=PixLab"
curl -sS -X POST "$BASE/v1/image" -H "X-Api-Key: $API_KEY" -F "action=pdf" -F "images=@./samples/a.jpg" -F "format=pdf" -F "pdfMode=single"
curl -sS -X POST "$BASE/v1/image" -H "X-Api-Key: $API_KEY" -F "action=multitask" -F "images=@./samples/a.jpg" -F "width=1200" -F "format=webp"
```

---

## `POST /v1/pdf`

All calls use multipart form-data with PDF file(s) in `files`.

| Action | Notes |
|---|---|
| `merge` | merge multiple PDFs; optional alphabetical sorting |
| `to-images` | render selected/all pages to images |
| `compress` | rebuild document via pdf-lib |
| `extract-images` | render selected/all pages to PNG/JPEG/WEBP |
| `watermark` | text and/or image watermark |
| `rotate` | rotate selected pages |
| `metadata` | read and optionally overwrite metadata |
| `reorder` | reorder pages by `order` list |
| `delete-pages` | remove selected pages |
| `extract` | output only selected pages |
| `flatten` | flatten forms/all metadata options |
| `encrypt` | qpdf-based encryption |
| `decrypt` | qpdf-based decryption |
| `split` | split into multiple outputs by ranges |

```bash
curl -sS -X POST "$BASE/v1/pdf" \
  -H "X-Api-Key: $API_KEY" \
  -F "action=to-images" \
  -F "files=@./samples/doc.pdf" \
  -F "pages=1-3" \
  -F "toFormat=png" \
  -F "dpi=180" \
  -F "width=1600" \
  -F "height=2200"
```

```bash
curl -sS -X POST "$BASE/v1/pdf" \
  -H "X-Api-Key: $API_KEY" \
  -F "action=split" \
  -F "files=@./samples/doc.pdf" \
  -F "ranges=1-2,3-5" \
  -F "prefix=chapter_"
```


### Action-specific cURL examples (pdf endpoint)

```bash
curl -sS -X POST "$BASE/v1/pdf" -H "X-Api-Key: $API_KEY" -F "action=merge" -F "files=@./samples/one.pdf" -F "files=@./samples/two.pdf" -F "sortByName=true"
curl -sS -X POST "$BASE/v1/pdf" -H "X-Api-Key: $API_KEY" -F "action=to-images" -F "files=@./samples/doc.pdf" -F "pages=1-3" -F "toFormat=png" -F "dpi=180"
curl -sS -X POST "$BASE/v1/pdf" -H "X-Api-Key: $API_KEY" -F "action=compress" -F "files=@./samples/doc.pdf"
curl -sS -X POST "$BASE/v1/pdf" -H "X-Api-Key: $API_KEY" -F "action=extract-images" -F "files=@./samples/doc.pdf" -F "pages=all" -F "toFormat=jpeg"
curl -sS -X POST "$BASE/v1/pdf" -H "X-Api-Key: $API_KEY" -F "action=watermark" -F "files=@./samples/doc.pdf" -F "watermarkText=CONFIDENTIAL" -F "opacity=0.3"
curl -sS -X POST "$BASE/v1/pdf" -H "X-Api-Key: $API_KEY" -F "action=rotate" -F "files=@./samples/doc.pdf" -F "degrees=90" -F "pages=1,2"
curl -sS -X POST "$BASE/v1/pdf" -H "X-Api-Key: $API_KEY" -F "action=metadata" -F "files=@./samples/doc.pdf" -F "title=Updated title"
curl -sS -X POST "$BASE/v1/pdf" -H "X-Api-Key: $API_KEY" -F "action=reorder" -F "files=@./samples/doc.pdf" -F "order=3,1,2"
curl -sS -X POST "$BASE/v1/pdf" -H "X-Api-Key: $API_KEY" -F "action=delete-pages" -F "files=@./samples/doc.pdf" -F "pages=2-4"
curl -sS -X POST "$BASE/v1/pdf" -H "X-Api-Key: $API_KEY" -F "action=extract" -F "files=@./samples/doc.pdf" -F "pages=5-8"
curl -sS -X POST "$BASE/v1/pdf" -H "X-Api-Key: $API_KEY" -F "action=flatten" -F "files=@./samples/doc.pdf" -F "flattenForms=true"
curl -sS -X POST "$BASE/v1/pdf" -H "X-Api-Key: $API_KEY" -F "action=encrypt" -F "files=@./samples/doc.pdf" -F "userPassword=userpass" -F "ownerPassword=ownerpass"
curl -sS -X POST "$BASE/v1/pdf" -H "X-Api-Key: $API_KEY" -F "action=decrypt" -F "files=@./samples/locked.pdf" -F "password=userpass"
curl -sS -X POST "$BASE/v1/pdf" -H "X-Api-Key: $API_KEY" -F "action=split" -F "files=@./samples/doc.pdf" -F "ranges=1-2,3-5" -F "prefix=chapter_"
```

| Parameter | Type | Required | Accepted values / format | Default | Constraints / behavior |
|---|---|---:|---|---|---|
| `action` | string | yes | action list above | — | Must match supported action set. |
| `files` | file[] | yes | `application/pdf` | — | `merge` accepts multiple; most actions use first PDF only. |
| `sortByName` | bool/string | no | true/false | false | `merge` only. |
| `pages` | string | action-dependent | `all`, `1,3`, `1-5` | `all` for some actions | Used by `to-images`,`extract-images`,`watermark`,`rotate`,`delete-pages`,`extract`. |
| `toFormat` / `imageFormat` | string | no | `png`,`jpeg`,`jpg`,`webp` | `png` | Output format for image-rendering actions. |
| `dpi` | integer | no | int | `150` | Used for page rasterization. |
| `width`,`height` | integer | no | positive ints | none | Optional resize after render in image actions. |
| `watermarkImage` | file | no | image/* | none | Used by `watermark`. |
| `watermarkText` | string | no | text | none | Used by `watermark`. |
| `position` | string | no | gravity-like string | `center` | Watermark position. |
| `opacity` | number | no | numeric | `0.2` | Watermark opacity (clamped). |
| `fontSize` | integer | no | int | `36` | Text watermark size. |
| `color` | string | no | color string | `#ff0000` | Text watermark color. |
| `watermarkScale` | number | no | numeric | `0.25` | Image watermark scale. |
| `margin` | integer | no | non-negative int | `24` | Watermark margin. |
| `degrees` | integer | no | numeric | `90` | `rotate` action. |
| `order` | string | yes for reorder | CSV page numbers | — | 1-based list for page reordering. |
| `title`,`author`,`subject`,`keywords`,`creator`,`producer` | string | no | text | unchanged | Metadata override in `metadata` action. |
| `cleanAllMetadata` | bool/string | no | true/false | false | `metadata` action cleanup mode. |
| `flattenForms` | bool/string | no | true/false | false | `flatten` behavior. |
| `userPassword`,`ownerPassword` | string | yes for encrypt | text | — | `encrypt` requires qpdf installed. |
| `password` | string | yes for decrypt | text | — | `decrypt` password input. |
| `ranges` | string | yes for split | `1-3,4-6` | — | Parsed into N output files. |
| `prefix` | string | no | filename prefix | `split_` | `split` output naming prefix. |

---

## `POST /v1/tools`

Action must be `single` or `multitask`; tools are declared with `tools` (comma-separated) or `tools[]`.

### Single tool: `metadata`

```bash
curl -sS -X POST "$BASE/v1/tools" \
  -H "X-Api-Key: $API_KEY" \
  -F "action=single" \
  -F "tools=metadata" \
  -F "images=@./samples/a.jpg" \
  -F "includeRawExif=true"
```

### Single tool: `colors`
```bash
curl -sS -X POST "$BASE/v1/tools" -H "X-Api-Key: $API_KEY" \
  -F "action=single" -F "tools=colors" -F "images=@./samples/a.jpg" -F "paletteSize=6"
```

### Single tool: `detect-format`
```bash
curl -sS -X POST "$BASE/v1/tools" -H "X-Api-Key: $API_KEY" \
  -F "action=single" -F "tools=detect-format" -F "images=@./samples/a.gif"
```

### Single tool: `orientation`
```bash
curl -sS -X POST "$BASE/v1/tools" -H "X-Api-Key: $API_KEY" \
  -F "action=single" -F "tools=orientation" -F "images=@./samples/a.jpg"
```

### Single tool: `hash`
```bash
curl -sS -X POST "$BASE/v1/tools" -H "X-Api-Key: $API_KEY" \
  -F "action=single" -F "tools=hash" -F "images=@./samples/a.jpg" -F "hashType=sha256"
```

### Single tool: `similarity`
```bash
curl -sS -X POST "$BASE/v1/tools" -H "X-Api-Key: $API_KEY" \
  -F "action=single" -F "tools=similarity" \
  -F "images=@./samples/a.jpg" -F "images=@./samples/b.jpg" \
  -F "similarityMode=pairs" -F "similarityThreshold=8"
```

### Single tool: `dimensions`
```bash
curl -sS -X POST "$BASE/v1/tools" -H "X-Api-Key: $API_KEY" \
  -F "action=single" -F "tools=dimensions" -F "images=@./samples/a.jpg"
```

### Single tool: `palette`
```bash
curl -sS -X POST "$BASE/v1/tools" -H "X-Api-Key: $API_KEY" \
  -F "action=single" -F "tools=palette" -F "images=@./samples/a.jpg" -F "paletteSize=8"
```

### Single tool: `transparency`
```bash
curl -sS -X POST "$BASE/v1/tools" -H "X-Api-Key: $API_KEY" \
  -F "action=single" -F "tools=transparency" -F "images=@./samples/a.png" -F "transparencySample=64"
```

### Single tool: `quality`
```bash
curl -sS -X POST "$BASE/v1/tools" -H "X-Api-Key: $API_KEY" \
  -F "action=single" -F "tools=quality" -F "images=@./samples/a.jpg" -F "qualitySample=256"
```

### Single tool: `efficiency`
```bash
curl -sS -X POST "$BASE/v1/tools" -H "X-Api-Key: $API_KEY" \
  -F "action=single" -F "tools=efficiency" -F "images=@./samples/a.jpg" \
  -F "efficiencyFormat=webp" -F "efficiencyQuality=80"
```

### Multitask (multiple tools in one call)

```bash
curl -sS -X POST "$BASE/v1/tools" \
  -H "X-Api-Key: $API_KEY" \
  -F "action=multitask" \
  -F "tools=metadata,palette,hash,similarity,efficiency" \
  -F "images=@./samples/a.jpg" \
  -F "images=@./samples/b.jpg" \
  -F "includeRawExif=true" \
  -F "paletteSize=6" \
  -F "hashType=phash" \
  -F "similarityMode=pairs" \
  -F "similarityThreshold=8" \
  -F "efficiencyFormat=webp" \
  -F "efficiencyQuality=80"
```

| Parameter | Type | Required | Accepted values / format | Default | Constraints / behavior |
|---|---|---:|---|---|---|
| `action` | string | yes | `single` or `multitask` | — | `single` requires exactly one tool. |
| `images` | file[] | yes | image file(s) | — | Allowed MIME: jpeg/png/webp/gif/avif/svg. |
| `tools` / `tools[]` | string | yes | comma-list tool names | — | Supported: `metadata`,`colors`,`detect-format`,`orientation`,`hash`,`similarity`,`dimensions`,`palette`,`transparency`,`quality`,`efficiency`. |
| `includeRawExif` | bool/string | no | true/false | false | `metadata` only. |
| `paletteSize` | integer | no | int | `5` | Clamped `1..16`; used by `colors`/`palette`. |
| `hashType` | string | no | `phash`,`md5`,`sha1`,`sha256` | `phash` | Others fallback to `phash`. |
| `qualitySample` | integer | no | int | `256` | Clamped `64..512`; used by `quality`. |
| `transparencySample` | integer | no | int | `64` | Clamped `16..128`; used by `transparency`. |
| `similarityMode` | string | no | `pairs`,`toFirst` | `pairs` | `pairs` max 25 files; `toFirst` compares all files to first. |
| `similarityThreshold` | integer | no | int | `8` | Clamped `0..64`; lower = stricter similarity. |
| `efficiencyFormat` | string | no | `jpeg`,`jpg`,`png`,`webp`,`avif` | none | Used by `efficiency`. |
| `efficiencyQuality` | integer | no | int | `80` | Clamped per encoder path. |

