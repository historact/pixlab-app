# PixLab Internal Snapshot Debugging

## Snapshot debug logging

Snapshot debug logging is enabled by default for internal snapshot endpoints. You can disable it with:

```
SNAPSHOT_DEBUG=0
```

Logs are emitted as JSON lines on the internal channel with event `snapshot.debug`.

## Endpoints

### Snapshot view

```
curl -i \
  -H "x-davix-bridge-token: $SUBSCRIPTION_BRIDGE_TOKEN" \
  "${PUBLIC_BASE_URL:-http://localhost:${PORT:-3005}}/internal/admin/monitoring/snapshot-view?rule_id=1"
```

### Snapshot PNG

```
curl -i \
  -H "x-davix-bridge-token: $SUBSCRIPTION_BRIDGE_TOKEN" \
  "${PUBLIC_BASE_URL:-http://localhost:${PORT:-3005}}/internal/admin/monitoring/snapshot?rule_id=1"
```

### Snapshot debug ping

```
curl -i \
  -H "x-davix-bridge-token: $SUBSCRIPTION_BRIDGE_TOKEN" \
  "${PUBLIC_BASE_URL:-http://localhost:${PORT:-3005}}/internal/admin/monitoring/snapshot-debug/ping"
```

## Log locations

Internal logs are handled by the existing logger system and appear in the `internal` log channel.

## Alert notification env vars

Required (enable in admin alert settings as well):

- `ALERT_TELEGRAM_BOT_TOKEN` - Telegram bot token for sendMessage/sendPhoto.
- `ALERT_TELEGRAM_API_BASE_URL` - Optional override for testing (default `https://api.telegram.org`).
- `ALERT_EMAIL_HOST`, `ALERT_EMAIL_PORT`, `ALERT_EMAIL_USER`, `ALERT_EMAIL_PASS`, `ALERT_EMAIL_FROM` - SMTP settings.
- `ALERT_EMAIL_JSON_TRANSPORT=true` - Optional local testing mode (no SMTP).

Snapshot/link behavior:

- `PUBLIC_BASE_URL` - Public HTTPS base URL used for alert links and snapshot rendering.
- `SNAPSHOT_BASE_URL` - Optional override for snapshot capture base URL (defaults to `PUBLIC_BASE_URL`).
- `INTERNAL_BASE_URL` - Optional internal base URL if you truly need localhost access.
- `TRUST_PROXY=1` - Enable correct HTTPS detection behind reverse proxies.

Internal snapshot auth:

- `SUBSCRIPTION_BRIDGE_TOKEN` - Required for internal snapshot endpoints.
- `INTERNAL_ALLOWED_IPS` - Allowlist for internal snapshot endpoints.

## Reverse proxy + snapshot delivery notes

- Set `TRUST_PROXY=1` (or the hop count for your proxy chain) so Express honors `X-Forwarded-*` and marks secure cookies correctly when TLS is terminated upstream.
- Set `PUBLIC_BASE_URL=https://your.domain` so alert links always point to the externally reachable HTTPS URL.
- Do not point snapshot generation at `127.0.0.1` unless the app actually listens there; prefer `PUBLIC_BASE_URL` or `SNAPSHOT_BASE_URL`.
- Telegram snapshots are uploaded as multipart/form-data from the server (not a public URL) to avoid Telegram failing to fetch images from non-public or HTTP-only URLs.
- Alerting fetches snapshots server-side using `SUBSCRIPTION_BRIDGE_TOKEN` and falls back to a public snapshot link when the fetch fails.

## Simulate alert notifications

Use this script to exercise snapshot fetch + Telegram upload + email delivery without waiting for a real alert:

```
node scripts/simulate-alert-notification.js 1
```

Notes:

- Requires `SUBSCRIPTION_BRIDGE_TOKEN` and `PUBLIC_BASE_URL`.
- The snapshot endpoint is protected by `INTERNAL_ALLOWED_IPS` if configured, so ensure the server IP is allowlisted.
