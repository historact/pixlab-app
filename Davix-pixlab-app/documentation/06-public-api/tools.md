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
- `hashType` (phash|md5|sha1|sha256)
- `similarityMode` (pairs|toFirst, default pairs) & `similarityThreshold` (0-64, default 8) when using tool `similarity`
- `qualitySample` (64-512, default 256) for tool `quality`
- `transparencySample` (16-128, default 64) for tool `transparency`
- `efficiencyFormat` (jpeg|webp|avif|png) and `efficiencyQuality` (1-100) for tool `efficiency`

## Response
`{ "results": [ { originalName, tools: { metadata, colors, detect-format, orientation, hash } } ] }`
If `similarity` is requested, a top-level `batch.similarity` array is included.

## Errors
`missing_field`, `monthly_quota_exceeded`, `too_many_files`, `payload_too_large`, `rate_limit_exceeded`, `tool_processing_failed`, `invalid_api_key`.

## Examples
1) SHA256 hash:
```bash
curl -X POST https://pixlab.davix.dev/v1/tools \
  -H "X-Api-Key: YOUR_KEY" \
  -F "images=@img1.png" \
  -F "tools=hash" \
  -F "hashType=sha256"
```
2) Dimensions:
```bash
curl -X POST https://pixlab.davix.dev/v1/tools \
  -H "X-Api-Key: YOUR_KEY" \
  -F "images=@img1.jpg" \
  -F "tools=dimensions"
```
3) Palette:
```bash
curl -X POST https://pixlab.davix.dev/v1/tools \
  -H "X-Api-Key: YOUR_KEY" \
  -F "images=@img1.png" \
  -F "tools=palette" \
  -F "paletteSize=8"
```
4) Transparency:
```bash
curl -X POST https://pixlab.davix.dev/v1/tools \
  -H "X-Api-Key: YOUR_KEY" \
  -F "images=@img1.png" \
  -F "tools=transparency"
```
5) Similarity pairs:
```bash
curl -X POST https://pixlab.davix.dev/v1/tools \
  -H "X-Api-Key: YOUR_KEY" \
  -F "images=@a.png" \
  -F "images=@b.png" \
  -F "tools=similarity" \
  -F "similarityMode=pairs"
```
6) Efficiency estimate:
```bash
curl -X POST https://pixlab.davix.dev/v1/tools \
  -H "X-Api-Key: YOUR_KEY" \
  -F "images=@img1.png" \
  -F "tools=efficiency" \
  -F "efficiencyFormat=webp" \
  -F "efficiencyQuality=80"
```
