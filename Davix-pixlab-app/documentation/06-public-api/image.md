# POST /v1/image

- **Purpose**: Transform uploaded images (resize, crop, rotate, format change) and optionally export to PDF.
- **Auth**: API key required.
- **Limits**: Max 50 files overall; public keys max 10 files and 10 MB total, dimensions capped at 6000px; daily per-IP limit 10 files.
- **Quota**: Customer keys consume `max(files,1)`.
- **Action required**: one of `format`, `resize`, `crop`, `transform`, `compress`, `enhance`, `padding`, `frame`, `background`, `watermark`, `pdf`, `metadata`, `multitask`.

## Request
Multipart form with `images` files and `action` field.

### Actions
- `multitask`: Backward-compatible power mode. Accepts **all** parameters below and runs the full pipeline (recommended for existing clients).
- `metadata`: Returns metadata only (no output files). Params: `normalizeOrientation`, `keepMetadata`, `includeRawExif`.
- Other actions: Process files normally; parameters outside the action set are ignored.

### Common parameters (all actions except `metadata` may also include these)
- `format` (jpg|png|webp|avif|gif|svg|pdf)
- `keepMetadata` (bool)

### Geometry / transforms
- `width`, `height` (ints)
- `enlarge` (bool)
- `cropX`, `cropY`, `cropWidth`, `cropHeight` (ints)
- `rotate` (int degrees)
- `flipH`, `flipV` (bool)
- `normalizeOrientation` (bool) — apply EXIF orientation

### Compression / PDF
- `targetSizeKB` (int)
- `quality` (int)
- `pdfMode` (single|multi when format=pdf)
- `pdfPageSize` (auto|a4|letter)
- `pdfOrientation` (portrait|landscape)
- `pdfMargin` (int)
- `pdfEmbedFormat` (png|jpeg)
- `pdfJpegQuality` (20-100)

### Enhancements
- `blur` (float), `sharpen` (bool|float), `grayscale` (bool), `sepia` (bool), `brightness` (0-2), `contrast` (0-2), `saturation` (0-2)

### Layout / framing
- Padding/canvas: `pad` or `padTop/padRight/padBottom/padLeft`, `padColor`
- Border/frame: `border`, `borderColor`, `borderRadius`
- Background replacement (for transparency or jpeg): `backgroundColor`, `backgroundBlur`

### Watermarks
- Text (`watermarkText`, `watermarkFontSize`, `watermarkColor`, `watermarkOpacity`, `watermarkPosition`, `watermarkMargin`)
- Image (`watermarkImage` file, `watermarkScale`)

### Color space
- `colorSpace` (srgb|grayscale|cmyk*) — cmyk only if supported

## Response
`multitask` and other file-producing actions: `{ "results": [ { url, format, sizeBytes, width, height, quality, originalName } ] }`

`metadata` action: `{ "results": [ { originalName, metadata: { sharp, originalMetadata, originalOrientation, normalizedOrientation, exif, rawExif, icc } } ] }`

## Errors
`missing_field`, `invalid_parameter`, `monthly_quota_exceeded`, `too_many_files`, `payload_too_large`, `rate_limit_exceeded`, `image_processing_failed`, `invalid_api_key`.

## Examples
1) Multitask (full pipeline) with text watermark:
```bash
curl -X POST https://pixlab.davix.dev/v1/image \
  -H "X-Api-Key: YOUR_KEY" \
  -F "action=multitask" \
  -F "images=@input.png" \
  -F "watermarkText=Sample" \
  -F "watermarkPosition=bottom-right" \
  -F "watermarkOpacity=0.4"
```
2) Image watermark (multitask or watermark action):
```bash
curl -X POST https://pixlab.davix.dev/v1/image \
  -H "X-Api-Key: YOUR_KEY" \
  -F "action=watermark" \
  -F "images=@input.png" \
  -F "watermarkImage=@logo.png" \
  -F "watermarkScale=0.2" \
  -F "watermarkPosition=top-left"
```
3) Border + rounded corners + padding (frame/padding actions):
```bash
curl -X POST https://pixlab.davix.dev/v1/image \
  -H "X-Api-Key: YOUR_KEY" \
  -F "action=frame" \
  -F "images=@input.jpg" \
  -F "pad=20" -F "padColor=#ffffff" \
  -F "border=10" -F "borderColor=#222222" \
  -F "borderRadius=24"
```
4) Background flatten + grayscale + blur (background/enhance actions):
```bash
curl -X POST https://pixlab.davix.dev/v1/image \
  -H "X-Api-Key: YOUR_KEY" \
  -F "action=background" \
  -F "images=@input.png" \
  -F "backgroundColor=#f0f0f0" \
  -F "grayscale=true" \
  -F "blur=2"
```
5) Metadata only (no output files):
```bash
curl -X POST https://pixlab.davix.dev/v1/image \
  -H "X-Api-Key: YOUR_KEY" \
  -F "action=metadata" \
  -F "images=@input.jpg" \
  -F "normalizeOrientation=true" \
  -F "includeRawExif=true"
```
