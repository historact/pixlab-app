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
  "http://127.0.0.1:${PORT:-3005}/internal/admin/monitoring/snapshot-view?rule_id=1"
```

### Snapshot PNG

```
curl -i \
  -H "x-davix-bridge-token: $SUBSCRIPTION_BRIDGE_TOKEN" \
  "http://127.0.0.1:${PORT:-3005}/internal/admin/monitoring/snapshot?rule_id=1"
```

### Snapshot debug ping

```
curl -i \
  -H "x-davix-bridge-token: $SUBSCRIPTION_BRIDGE_TOKEN" \
  "http://127.0.0.1:${PORT:-3005}/internal/admin/monitoring/snapshot-debug/ping"
```

## Log locations

Internal logs are handled by the existing logger system and appear in the `internal` log channel.
