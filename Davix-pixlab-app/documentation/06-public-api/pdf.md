# POST /v1/pdf

- **Purpose**: PDF utilities including merge, split, compress, convert to images, and extract images.
- **Auth**: API key required.
- **Limits**: Public keys max 10 files and 10 MB per request; per-IP daily cap of 10 files. Timeout shorter for public keys.
- **Quota**: Customer keys consume number of files uploaded (default 1).

## Request
Multipart with `files` or `file`. Body fields:
- `action` (required) one of:
  - Existing: `to-images`, `merge`, `split`, `compress`, `extract-images`
  - New: `watermark`, `rotate`, `metadata`, `reorder`, `delete-pages`, `extract`, `flatten`, `encrypt`, `decrypt`
- Shared: `pages` supports list/ranges or `all`/`first` (where applicable)
- Existing params unchanged (toFormat/width/height/dpi/sortByName/ranges/prefix/imageFormat)
- Watermark: `watermarkText` or `watermarkImage` (file), `opacity` (0-1), `position`, `margin`, `fontSize`, `color`, `pages`, `watermarkScale`
- Rotate: `degrees` (90|180|270), `pages`
- Metadata: `title`, `author`, `subject`, `keywords`, `creator`, `producer`, `cleanAllMetadata` (bool)
- Reorder: `order` JSON array (permutation of all pages)
- Delete-pages: `pages` (required)
- Extract: `pages` (required), `mode` (single|multiple), `prefix` (optional label)
- Flatten: `flattenForms` (bool, default true)
- Encrypt (requires qpdf installed): `userPassword` (required), `ownerPassword` (optional)
- Decrypt (requires qpdf installed): `password` (required)

## Response
Varies by action: merged/compressed/split returns `url` and size metadata; conversions return `results` array with URLs and page info.

## Errors
`missing_field`, `monthly_quota_exceeded`, `too_many_files`, `payload_too_large`, `rate_limit_exceeded`, `pdf_tool_failed`, `invalid_parameter`, `invalid_api_key`.

## Examples
1) Watermark text on all pages:
```bash
curl -X POST https://pixlab.davix.dev/v1/pdf \
  -H "X-Api-Key: YOUR_KEY" \
  -F "file=@in.pdf" \
  -F "action=watermark" \
  -F "watermarkText=CONFIDENTIAL" \
  -F "opacity=0.3" \
  -F "position=bottom-right"
```
2) Watermark image pages 1-3:
```bash
curl -X POST https://pixlab.davix.dev/v1/pdf \
  -H "X-Api-Key: YOUR_KEY" \
  -F "file=@in.pdf" \
  -F "watermarkImage=@logo.png" \
  -F "action=watermark" \
  -F "pages=1-3" \
  -F "watermarkScale=0.2"
```
3) Rotate 90 degrees:
```bash
curl -X POST https://pixlab.davix.dev/v1/pdf \
  -H "X-Api-Key: YOUR_KEY" \
  -F "file=@in.pdf" \
  -F "action=rotate" \
  -F "degrees=90" \
  -F "pages=all"
```
4) Set metadata title/author:
```bash
curl -X POST https://pixlab.davix.dev/v1/pdf \
  -H "X-Api-Key: YOUR_KEY" \
  -F "file=@in.pdf" \
  -F "action=metadata" \
  -F "title=My Doc" \
  -F "author=Alice"
```
5) Clean all metadata:
```bash
curl -X POST https://pixlab.davix.dev/v1/pdf \
  -H "X-Api-Key: YOUR_KEY" \
  -F "file=@in.pdf" \
  -F "action=metadata" \
  -F "cleanAllMetadata=true"
```
6) Reorder pages [2,1,3]:
```bash
curl -X POST https://pixlab.davix.dev/v1/pdf \
  -H "X-Api-Key: YOUR_KEY" \
  -F "file=@in.pdf" \
  -F "action=reorder" \
  -F 'order=[2,1,3]'
```
7) Delete pages 2,4-5:
```bash
curl -X POST https://pixlab.davix.dev/v1/pdf \
  -H "X-Api-Key: YOUR_KEY" \
  -F "file=@in.pdf" \
  -F "action=delete-pages" \
  -F "pages=2,4-5"
```
8) Extract pages 1-2 (single):
```bash
curl -X POST https://pixlab.davix.dev/v1/pdf \
  -H "X-Api-Key: YOUR_KEY" \
  -F "file=@in.pdf" \
  -F "action=extract" \
  -F "pages=1-2" \
  -F "mode=single"
```
9) Extract pages 1-3 (multiple):
```bash
curl -X POST https://pixlab.davix.dev/v1/pdf \
  -H "X-Api-Key: YOUR_KEY" \
  -F "file=@in.pdf" \
  -F "action=extract" \
  -F "pages=1-3" \
  -F "mode=multiple"
```
10) Encrypt & decrypt (qpdf):
```bash
curl -X POST https://pixlab.davix.dev/v1/pdf \
  -H "X-Api-Key: YOUR_KEY" \
  -F "file=@in.pdf" \
  -F "action=encrypt" \
  -F "userPassword=1234"
curl -X POST https://pixlab.davix.dev/v1/pdf \
  -H "X-Api-Key: YOUR_KEY" \
  -F "file=@encrypted.pdf" \
  -F "action=decrypt" \
  -F "password=1234"
```
