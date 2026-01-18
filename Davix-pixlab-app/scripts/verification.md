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

## Admin UI: tabs, rule modal, channel visibility

```bash
# Start the server (adjust env as needed for admin auth)
node server.js
```

```bash
# Load the admin page (browser) and verify:
# - Tabs order: Monitoring, Debug Logs, Alerting
# - Click tabs to confirm URL hash + localStorage persistence on refresh
# - Open New Rule / Edit to confirm modal behavior + Cancel close
# - Toggle global Alerting settings and verify channel toggles hide/show
open "$BASE_URL$ADMIN_PATH"
```

## Alert template tokens (monitoring context)

```bash
# Inspect available template tokens from code (expanded list should be printed)
node -e "const { templateTokens } = require('./utils/alerts'); console.log(Object.keys(templateTokens({})).sort().join('\\n'));"
```

```bash
# Sample token render with monitoring payload (replace values as needed)
node -e "const { templateTokens, applyTemplate } = require('./utils/alerts'); const payload = { rule_name:'High CPU', severity:'warn', state:'FIRING', since:'2024-01-01T00:00:00Z', metric:'cpu_percent', operator:'>', threshold:90, value:95, scope:'global', metrics:{ cpu_percent:95, uptime_sec:120, rss_mb:512, heap_used_mb:256, heap_total_mb:512, event_loop_delay_ms:12, req_per_min:1200, errors_per_min:2, timeouts_per_min:0, error_rate:0.01, endpoint_req_per_min:0, endpoint_errors_per_min:0, endpoint_timeouts_per_min:0, endpoint_error_rate:0, endpoint_avg_latency_ms:0, endpoint_p95_latency_ms:0, queue_active:0, queue_queued:0 } }; const tpl = '{rule_name} {severity} {state} {metric} {operator} {threshold} value={value} cpu={cpu_percent}'; console.log(applyTemplate(tpl, templateTokens(payload)));"
```
