# Monitoring + Alerting Verification

## Metrics endpoints
- Admin metrics (requires admin session cookie):
  - `curl -i -b "pixlab_admin=YOUR_COOKIE" http://localhost:3005/${ADMIN_PATH}/${ADMIN_PASS}/api/monitoring/metrics`
  - `curl -i -b "pixlab_admin=YOUR_COOKIE" "http://localhost:3005/${ADMIN_PATH}/${ADMIN_PASS}/api/monitoring/range?from=$(($(date +%s)-900))000&to=$(date +%s)000&bucket_sec=10"`

- Internal metrics (requires IP allowlist + bridge token):
  - `curl -i -H "x-davix-bridge-token: $SUBSCRIPTION_BRIDGE_TOKEN" http://127.0.0.1:3005/internal/admin/monitoring/metrics`

## Alert rule lifecycle
- Create a rule:
  - POST `/api/monitoring/alerts/rules` with JSON:
    - `{"name":"High CPU","enabled":true,"metric_key":"cpu_percent","operator":">","threshold":90,"for_sec":0,"eval_interval_sec":10,"cooldown_sec":300,"severity":"warn","scope":{"endpoint":""}}`
- Verify FIRING:
  - Set a low threshold or simulate metric load.
  - Check Active Alerts table in Monitoring tab.
- Verify RESOLVED:
  - Reduce load, ensure alert state transitions and appears in Resolved Alerts.
- Verify cooldown:
  - Confirm that repeated FIRING notifications are suppressed within cooldown.
- Verify ACK/SILENCE:
  - Click Ack/Silence in the Active Alerts table and confirm alerts stop notifying.

## Snapshot delivery
- Ensure `SUBSCRIPTION_BRIDGE_TOKEN` is set and internal allowlist allows localhost.
- Trigger an alert to FIRING and confirm:
  - Snapshot PNG is generated under `os.tmpdir()/pixlab-alert-snapshots`.
  - Email includes PNG attachment.
  - Telegram uses `sendPhoto` with caption.

## Security checks
- Snapshot renderer only loads localhost; external requests are blocked.
- Internal endpoints require allowlisted IP + bridge token.
