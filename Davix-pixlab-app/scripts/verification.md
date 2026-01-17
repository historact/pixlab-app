# PixLab Verification Commands

> Replace `$API_KEY`, `$BASE_URL`, `$BRIDGE_TOKEN`, and `$ALLOWLISTED_IP` as needed.

## /v1/tools MIME allowlist

```bash
# Expect 415 unsupported_media_type for non-image upload
curl -sS -X POST "$BASE_URL/v1/tools" \
  -H "X-Api-Key: $API_KEY" \
  -F "action=single" \
  -F "tools=metadata" \
  -F "images=@./scripts/repro-all-endpoints.js;type=text/plain"
```

```bash
# Expect success for allowed image MIME types (example: PNG)
curl -sS -X POST "$BASE_URL/v1/tools" \
  -H "X-Api-Key: $API_KEY" \
  -F "action=single" \
  -F "tools=metadata" \
  -F "images=@/path/to/sample.png;type=image/png"
```

## Upload streaming + temp cleanup

```bash
# Confirm temp upload directory is used (OS temp) and emptied after request.
# Run after a request and verify old files are removed by cleanup job.
ls -la "$(node -p "require('os').tmpdir()")/pixlab-uploads"
```

## /health hardening

```bash
# Public /health should not include schema details
curl -sS "$BASE_URL/health"
```

```bash
# Internal diagnostics should require token + allowlisted IP
curl -sS "$BASE_URL/internal/admin/diagnostics/health" \
  -H "X-Davix-Bridge-Token: $BRIDGE_TOKEN"
```
