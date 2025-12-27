# POST /v1/h2i

- **Purpose**: Render HTML/CSS to an image or PDF using Puppeteer.
- **Auth**: API key via header/query/body.
- **Rate limits**: Public keys limited to 5 requests per IP per day; timeout 30s for public, 5m otherwise.
- **Quota**: Customer keys consume 1 file per call.
- **Action required**: `action=image` or `action=pdf`.

## Request
JSON body:
- `action` (required: `image` or `pdf`)
- `html` (string, required)
- `css` (string, optional)
- `width` (int, optional, default 1000)
- `height` (int, optional, default 1500)
- `format` (string png|jpeg, default png) — image action only
- `printMode` (bool, default false; pdf action only to honor @media print)
- PDF-only options when `action=pdf`:
  - `pdfFormat` (`A4`|`Letter`, default `A4`)
  - `pdfLandscape` (bool, default false)
  - `pdfMargin` (number px, default 24 applied on all sides)
  - `preferCSSPageSize` (bool, default true)
  - `scale` (float, default 1)
  - `printBackground` (bool, default true)

Headers: `X-Api-Key` or query `?key=`.

## Response
`{ "url": "<public URL>" }`

## Examples
Render JPEG image:
```bash
curl -X POST https://.../v1/h2i \
  -H "Content-Type: application/json" -H "X-Api-Key: KEY" \
  -d '{"action":"image","html":"<h1>Hello</h1>","format":"jpeg","width":800,"height":600}'
```

Render PDF in Letter landscape with margins:
```bash
curl -X POST https://.../v1/h2i \
  -H "Content-Type: application/json" -H "X-Api-Key: KEY" \
  -d '{"action":"pdf","html":"<article>Report</article>","pdfFormat":"Letter","pdfLandscape":true,"pdfMargin":12,"printMode":true}'
```

## Errors
`missing_field`, `invalid_parameter` (missing/invalid action), `monthly_quota_exceeded`, `rate_limit_exceeded`, `html_render_failed`, `invalid_api_key`, `timeout`.
