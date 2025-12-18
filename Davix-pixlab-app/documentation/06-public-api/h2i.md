# POST /v1/h2i

- **Purpose**: Render HTML/CSS to an image using Puppeteer.
- **Auth**: API key via header/query/body.
- **Rate limits**: Public keys limited to 5 requests per IP per day; timeout 30s for public, 5m otherwise.
- **Quota**: Customer keys consume 1 file per call.

## Request
JSON body:
- `html` (string, required)
- `css` (string, optional)
- `width` (int, optional, default 1000)
- `height` (int, optional, default 1500)
- `format` (string png|jpeg, default png)

Headers: `X-Api-Key` or query `?key=`.

## Response
`{ "url": "<public URL>" }`

## Errors
`missing_field`, `monthly_quota_exceeded`, `rate_limit_exceeded`, `html_render_failed`, `invalid_api_key`, `timeout`.
