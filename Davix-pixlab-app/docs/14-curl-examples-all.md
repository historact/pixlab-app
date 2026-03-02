# 14) cURL Examples (complete index)

> Placeholders:
> - `BASE=https://api.example.com`
> - `API_KEY=pk_live_xxx`
> - `BRIDGE_TOKEN=internal_secret`
> - `ADMIN_PATH=acp`
> - `ADMIN_PASS=replace_with_real_admin_pass`
> - `ADMIN_BASE="https://api.example.com/${ADMIN_PATH}/${ADMIN_PASS}"`

## External `/v1/*`

### `/v1/h2i` — action=image
```bash
curl -X POST "$BASE/v1/h2i" \
  -H "X-Api-Key: $API_KEY" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Idempotency-Key: h2i-image-0001" \
  -H "Content-Type: application/json" \
  -d '{
    "action":"image",
    "html":"<div style=""width:100%;height:100%;background:#eee"">Hello</div>",
    "css":"body{margin:0}",
    "width":1200,
    "height":1600,
    "format":"png",
    "pdfFormat":"A4",
    "pdfLandscape":false,
    "pdfMargin":24,
    "preferCSSPageSize":true,
    "scale":1,
    "printMode":false,
    "printBackground":true
  }'
```

### `/v1/h2i` — action=pdf
```bash
curl -X POST "$BASE/v1/h2i" \
  -H "X-Api-Key: $API_KEY" -H "Idempotency-Key: h2i-pdf-0001" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "action=pdf" \
  --data-urlencode "html=<h1>Invoice</h1>" \
  --data-urlencode "css=body{font-family:sans-serif}" \
  --data-urlencode "width=1000" \
  --data-urlencode "height=1500" \
  --data-urlencode "format=png" \
  --data-urlencode "pdfFormat=LETTER" \
  --data-urlencode "pdfLandscape=true" \
  --data-urlencode "pdfMargin=12" \
  --data-urlencode "preferCSSPageSize=true" \
  --data-urlencode "scale=1" \
  --data-urlencode "printMode=true" \
  --data-urlencode "printBackground=true"
```

### `/v1/image` — actions (`format|resize|crop|transform|compress|enhance|padding|frame|background|watermark|pdf|metadata|multitask`)
```bash
curl -X POST "$BASE/v1/image" \
  -H "X-Api-Key: $API_KEY" -H "Idempotency-Key: image-ops-0001" \
  -F "action=format" \
  -F "images=@./samples/a.jpg" \
  -F "images=@./samples/b.png" \
  -F "watermarkImage=@./samples/wm.png" \
  -F "format=webp" \
  -F "width=1200" -F "height=1200" -F "enlarge=false" \
  -F "cropX=10" -F "cropY=20" -F "cropWidth=800" -F "cropHeight=800" \
  -F "rotate=90" -F "flipH=true" -F "flipV=false" \
  -F "targetSizeKB=200" -F "quality=82" -F "keepMetadata=true" \
  -F "pdfMode=multi" -F "pdfPageSize=a4" -F "pdfOrientation=portrait" -F "pdfMargin=16" \
  -F "pdfEmbedFormat=jpeg" -F "pdfJpegQuality=85" \
  -F "normalizeOrientation=true" \
  -F "blur=0.8" -F "sharpen=1.1" -F "grayscale=false" -F "sepia=false" \
  -F "brightness=1.0" -F "contrast=1.0" -F "saturation=1.0" \
  -F "pad=0" -F "padTop=10" -F "padRight=10" -F "padBottom=10" -F "padLeft=10" -F "padColor=#ffffff" \
  -F "border=0" -F "borderColor=#000000" -F "borderRadius=0" \
  -F "backgroundColor=#ffffff" -F "backgroundBlur=0" \
  -F "watermarkText=PixLab" -F "watermarkFontSize=48" -F "watermarkColor=#ffffff" \
  -F "watermarkOpacity=0.35" -F "watermarkPosition=center" -F "watermarkMargin=24" -F "watermarkScale=0.25" \
  -F "colorSpace=srgb" -F "includeRawExif=false"
```

### `/v1/pdf` — action examples
```bash
# merge
curl -X POST "$BASE/v1/pdf" -H "X-Api-Key: $API_KEY" -H "Idempotency-Key: pdf-merge-0001" \
  -F "action=merge" -F "files=@./samples/one.pdf" -F "files=@./samples/two.pdf" -F "sortByName=true"

# to-images
curl -X POST "$BASE/v1/pdf" -H "X-Api-Key: $API_KEY" -H "Idempotency-Key: pdf-to-images-0001" \
  -F "action=to-images" -F "files=@./samples/doc.pdf" -F "pages=1-3" -F "format=png" -F "quality=85" -F "density=180"

# compress
curl -X POST "$BASE/v1/pdf" -H "X-Api-Key: $API_KEY" -H "Idempotency-Key: pdf-compress-0001" \
  -F "action=compress" -F "files=@./samples/doc.pdf"

# extract-images
curl -X POST "$BASE/v1/pdf" -H "X-Api-Key: $API_KEY" -H "Idempotency-Key: pdf-extract-images-0001" \
  -F "action=extract-images" -F "files=@./samples/doc.pdf" -F "pages=all" -F "format=png" -F "quality=85"

# watermark
curl -X POST "$BASE/v1/pdf" -H "X-Api-Key: $API_KEY" -H "Idempotency-Key: pdf-watermark-0001" \
  -F "action=watermark" -F "files=@./samples/doc.pdf" -F "watermarkImage=@./samples/wm.png" \
  -F "watermarkText=CONFIDENTIAL" -F "opacity=0.3" -F "position=center" -F "fontSize=36" -F "color=#ff0000" -F "pages=all"

# rotate
curl -X POST "$BASE/v1/pdf" -H "X-Api-Key: $API_KEY" -H "Idempotency-Key: pdf-rotate-0001" \
  -F "action=rotate" -F "files=@./samples/doc.pdf" -F "degrees=90" -F "pages=1,2"

# metadata
curl -X POST "$BASE/v1/pdf" -H "X-Api-Key: $API_KEY" -H "Idempotency-Key: pdf-meta-0001" \
  -F "action=metadata" -F "files=@./samples/doc.pdf"

# reorder
curl -X POST "$BASE/v1/pdf" -H "X-Api-Key: $API_KEY" -H "Idempotency-Key: pdf-reorder-0001" \
  -F "action=reorder" -F "files=@./samples/doc.pdf" -F "order=3,1,2"

# delete-pages
curl -X POST "$BASE/v1/pdf" -H "X-Api-Key: $API_KEY" -H "Idempotency-Key: pdf-delete-0001" \
  -F "action=delete-pages" -F "files=@./samples/doc.pdf" -F "pages=2-4"

# extract
curl -X POST "$BASE/v1/pdf" -H "X-Api-Key: $API_KEY" -H "Idempotency-Key: pdf-extract-0001" \
  -F "action=extract" -F "files=@./samples/doc.pdf" -F "pages=5-8"

# flatten
curl -X POST "$BASE/v1/pdf" -H "X-Api-Key: $API_KEY" -H "Idempotency-Key: pdf-flatten-0001" \
  -F "action=flatten" -F "files=@./samples/doc.pdf"

# encrypt
curl -X POST "$BASE/v1/pdf" -H "X-Api-Key: $API_KEY" -H "Idempotency-Key: pdf-encrypt-0001" \
  -F "action=encrypt" -F "files=@./samples/doc.pdf" -F "userPassword=userpass123" -F "ownerPassword=ownerpass123"

# decrypt
curl -X POST "$BASE/v1/pdf" -H "X-Api-Key: $API_KEY" -H "Idempotency-Key: pdf-decrypt-0001" \
  -F "action=decrypt" -F "files=@./samples/locked.pdf" -F "password=userpass123"

# split
curl -X POST "$BASE/v1/pdf" -H "X-Api-Key: $API_KEY" -H "Idempotency-Key: pdf-split-0001" \
  -F "action=split" -F "files=@./samples/doc.pdf" -F "ranges=1-2,3-5" -F "prefix=chapter_"
```

### `/v1/tools` — action=single and action=multitask
```bash
# single
curl -X POST "$BASE/v1/tools" -H "X-Api-Key: $API_KEY" -H "Idempotency-Key: tools-single-0001" \
  -F "action=single" -F "images=@./samples/a.jpg" \
  -F "tools=metadata" \
  -F "includeRawExif=true" -F "paletteSize=6" -F "hashType=phash" \
  -F "qualitySample=256" -F "transparencySample=64" -F "similarityMode=pairs" \
  -F "similarityThreshold=8" -F "efficiencyFormat=webp" -F "efficiencyQuality=80"

# multitask
curl -X POST "$BASE/v1/tools" -H "X-Api-Key: $API_KEY" -H "Idempotency-Key: tools-multi-0001" \
  -F "action=multitask" \
  -F "images=@./samples/a.jpg" -F "images=@./samples/b.png" \
  -F "tools=metadata,colors,detect-format,orientation,hash,similarity,dimensions,quality,transparency,efficiency" \
  -F "includeRawExif=false" -F "paletteSize=8" -F "hashType=sha256" \
  -F "qualitySample=320" -F "transparencySample=64" -F "similarityMode=tofirst" \
  -F "similarityThreshold=10" -F "efficiencyFormat=avif" -F "efficiencyQuality=70"
```

## Internal `/internal/*`

```bash
# shared headers
-H "x-davix-bridge-token: $BRIDGE_TOKEN" -H "Content-Type: application/json"
```

```bash
curl -X GET "$BASE/internal/ping" -H "x-davix-bridge-token: $BRIDGE_TOKEN"
curl -X POST "$BASE/internal/user/purge" -H "x-davix-bridge-token: $BRIDGE_TOKEN" -H "Content-Type: application/json" -d '{"api_key_ids":[123],"reason":"gdpr"}'
curl -X POST "$BASE/internal/user/lookup-key-id" -H "x-davix-bridge-token: $BRIDGE_TOKEN" -H "Content-Type: application/json" -d '{"wp_user_id":42}'
curl -X POST "$BASE/internal/user/summary" -H "x-davix-bridge-token: $BRIDGE_TOKEN" -H "Content-Type: application/json" -d '{"customer_email":"user@example.com"}'
curl -X POST "$BASE/internal/user/reconcile" -H "x-davix-bridge-token: $BRIDGE_TOKEN" -H "Content-Type: application/json" -d '{"wp_user_id":42,"customer_email":"user@example.com","plan_slug":"pro","subscription_status":"active","valid_from":"2026-01-01T00:00:00Z","valid_until":"2026-02-01T00:00:00Z"}'
curl -X POST "$BASE/internal/user/logs" -H "x-davix-bridge-token: $BRIDGE_TOKEN" -H "Content-Type: application/json" -d '{"wp_user_id":42,"page":1,"per_page":20,"endpoint":"/v1/pdf","status":"error","from":"2026-01-01","to":"2026-01-31"}'
curl -X POST "$BASE/internal/user/usage" -H "x-davix-bridge-token: $BRIDGE_TOKEN" -H "Content-Type: application/json" -d '{"wp_user_id":42,"range":"hourly","window":{"hours":48}}'
curl -X POST "$BASE/internal/subscription/event" -H "x-davix-bridge-token: $BRIDGE_TOKEN" -H "Content-Type: application/json" -d '{"event":"activated","event_id":"evt-001","wp_user_id":42,"customer_email":"user@example.com","plan_slug":"pro","subscription_id":"sub_123","order_id":"ord_123","subscription_status":"active","valid_from":"2026-01-01T00:00:00Z","valid_until":"2026-02-01T00:00:00Z"}'
curl -X POST "$BASE/internal/wp-sync/plan" -H "x-davix-bridge-token: $BRIDGE_TOKEN" -H "Content-Type: application/json" -d '{"plan_slug":"pro","name":"Pro","billing_period":"monthly","monthly_quota_files":1000,"max_files_per_request":20,"max_total_upload_mb":100,"max_dimension_px":8000,"timeout_seconds":120,"allow_h2i":1,"allow_image":1,"allow_pdf":1,"allow_tools":1,"is_free":0,"description":"Pro plan"}'
curl -X GET "$BASE/internal/admin/plans" -H "x-davix-bridge-token: $BRIDGE_TOKEN"
curl -X GET "$BASE/internal/admin/keys?page=1&per_page=20&search=user%40example.com" -H "x-davix-bridge-token: $BRIDGE_TOKEN"
curl -X GET "$BASE/internal/admin/keys/export?page=1&per_page=200&search=user&updated_after=2026-01-01T00:00:00Z" -H "x-davix-bridge-token: $BRIDGE_TOKEN"
curl -X POST "$BASE/internal/admin/key/provision" -H "x-davix-bridge-token: $BRIDGE_TOKEN" -H "Content-Type: application/json" -d '{"customer_email":"user@example.com","plan_slug":"pro","subscription_id":"sub_123","wp_user_id":42,"reactivated":true,"valid_from":"2026-01-01T00:00:00Z","valid_until":"2026-02-01T00:00:00Z"}'
curl -X POST "$BASE/internal/admin/key/disable" -H "x-davix-bridge-token: $BRIDGE_TOKEN" -H "Content-Type: application/json" -d '{"customer_email":"user@example.com"}'
curl -X POST "$BASE/internal/admin/key/rotate" -H "x-davix-bridge-token: $BRIDGE_TOKEN" -H "Content-Type: application/json" -d '{"subscription_id":"sub_123"}'
curl -X POST "$BASE/internal/user/key/rotate" -H "x-davix-bridge-token: $BRIDGE_TOKEN" -H "Content-Type: application/json" -d '{"wp_user_id":42}'
curl -X POST "$BASE/internal/user/key/toggle" -H "x-davix-bridge-token: $BRIDGE_TOKEN" -H "Content-Type: application/json" -d '{"wp_user_id":42,"action":"disable"}'
```

## Admin API `/{ADMIN_PATH}/{ADMIN_PASS}/api/*`

`ADMIN_PASS` has no runtime default and must be explicitly configured in ENV before these examples will work.

```bash
# 1) Fetch login page + store cookie
curl -c ./admin.cookie "$ADMIN_BASE/login" -o /tmp/login.html

# 2) Submit login (replace CSRF + credentials)
curl -b ./admin.cookie -c ./admin.cookie -X POST "$ADMIN_BASE/login" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data "_csrf=CSRF_TOKEN&password=ADMIN_PASSWORD&totp=123456"

# 3) Example authenticated API calls with CSRF header
curl -b ./admin.cookie "$ADMIN_BASE/api/settings"
curl -b ./admin.cookie "$ADMIN_BASE/api/logs/runtime?limit=100"
curl -b ./admin.cookie -X POST "$ADMIN_BASE/api/logs/runtime/settings" -H "X-CSRF-Token: CSRF_TOKEN" -H "Content-Type: application/json" -d '{"enabled":true}'
curl -b ./admin.cookie -X POST "$ADMIN_BASE/api/logs/runtime/clear" -H "X-CSRF-Token: CSRF_TOKEN" -d ''
curl -b ./admin.cookie "$ADMIN_BASE/api/logs/runtime/export"
curl -b ./admin.cookie "$ADMIN_BASE/api/subscription-events/settings"
curl -b ./admin.cookie -X POST "$ADMIN_BASE/api/subscription-events/settings" -H "X-CSRF-Token: CSRF_TOKEN" -H "Content-Type: application/json" -d '{"enabled":true}'
curl -b ./admin.cookie "$ADMIN_BASE/api/subscription-events?limit=50&offset=0&customer_email=user%40example.com"
curl -b ./admin.cookie "$ADMIN_BASE/api/subscription-events/export?event_type=activated"
curl -b ./admin.cookie -X POST "$ADMIN_BASE/api/subscription-events/clear" -H "X-CSRF-Token: CSRF_TOKEN" -d ''
curl -b ./admin.cookie -X POST "$ADMIN_BASE/api/alerts/settings" -H "X-CSRF-Token: CSRF_TOKEN" -H "Content-Type: application/json" -d '{"email":{"enabled":true}}'
curl -b ./admin.cookie -X POST "$ADMIN_BASE/api/alerts/test" -H "X-CSRF-Token: CSRF_TOKEN" -d ''
curl -b ./admin.cookie "$ADMIN_BASE/api/monitoring/metrics"
curl -b ./admin.cookie "$ADMIN_BASE/api/monitoring/range?from=1736000000&to=1736003600&bucket_sec=60"
curl -b ./admin.cookie "$ADMIN_BASE/api/monitoring/alerts/rules"
curl -b ./admin.cookie -X POST "$ADMIN_BASE/api/monitoring/alerts/rules" -H "X-CSRF-Token: CSRF_TOKEN" -H "Content-Type: application/json" -d '{"name":"High error rate","metric_key":"error_rate","operator":">","threshold":0.1,"severity":"warn"}'
curl -b ./admin.cookie -X POST "$ADMIN_BASE/api/monitoring/alerts/rules/1/test" -H "X-CSRF-Token: CSRF_TOKEN" -d ''
curl -b ./admin.cookie -X POST "$ADMIN_BASE/api/monitoring/alerts/rules/1/delete" -H "X-CSRF-Token: CSRF_TOKEN" -d ''
curl -b ./admin.cookie "$ADMIN_BASE/api/monitoring/alerts/active"
curl -b ./admin.cookie "$ADMIN_BASE/api/monitoring/alerts/resolved"
curl -b ./admin.cookie "$ADMIN_BASE/api/monitoring/alerts/deliveries?limit=50&status=failed"
curl -b ./admin.cookie -X POST "$ADMIN_BASE/api/monitoring/alerts/1/ack" -H "X-CSRF-Token: CSRF_TOKEN" -H "Content-Type: application/json" -d '{"duration_sec":600}'
curl -b ./admin.cookie -X POST "$ADMIN_BASE/api/monitoring/alerts/1/silence" -H "X-CSRF-Token: CSRF_TOKEN" -H "Content-Type: application/json" -d '{"duration_sec":900}'
```
