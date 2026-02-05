# 13) Admin API Reference — `/{ADMIN_PATH}/{ADMIN_PASS}/api/*`

## Auth and CSRF
- Session required (`req.session.adminAuthenticated` set by `/login`).
- CSRF middleware is active for the admin router; POST requests must include valid token (header or body field compatible with middleware).
- Login flow:
  1) `GET /{ADMIN_PATH}/{ADMIN_PASS}/login` to receive HTML with CSRF token + session cookie.
  2) `POST /{ADMIN_PATH}/{ADMIN_PASS}/login` with `password`, `totp`, and CSRF token.
  3) Use returned cookie for `/api/*` calls.

## Endpoint contracts

| Endpoint | Method | Parameters | Success | Error codes/status |
|---|---|---|---|---|
| `/api/settings` | GET | none | settings JSON | auth/session errors |
| `/api/logs/:channel` | GET | `channel` path; query consumed by `tailChannel` | `{items}` | `invalid_log_channel` (404) |
| `/api/logs/:channel/settings` | POST | `channel` path + settings body | settings JSON | `invalid_log_channel` |
| `/api/logs/:channel/clear` | POST | `channel` path | `{ok:true}` | `invalid_log_channel` |
| `/api/logs/:channel/export` | GET | `channel` path | JSONL download stream | `invalid_log_channel` |
| `/api/subscription-events/settings` | GET | none | settings JSON | auth/session errors |
| `/api/subscription-events/settings` | POST | settings body | updated settings | auth/csrf errors |
| `/api/subscription-events` | GET | query filters: `limit`,`offset`,`event_id`,`wp_user_id`,`customer_email`,`subscription_id`,`order_id`,`event_type`,`plan_slug`,`decision` | `{items,total,limit,offset}` | route/internal query errors |
| `/api/subscription-events/export` | GET | same filters as list | CSV download | export errors |
| `/api/subscription-events/clear` | POST | none | `{ok,cleared}` | `subscription_events_clear_failed` (500) |
| `/api/alerts/settings` | POST | alert settings body | updated settings | auth/csrf errors |
| `/api/alerts/test` | POST | none required | `{ok:true}` | alert dispatch runtime errors |
| `/api/monitoring/metrics` | GET | none | metrics snapshot JSON | auth/session errors |
| `/api/monitoring/range` | GET | `from`,`to`,`bucket_sec` (ints) | range series JSON | auth/session errors |
| `/api/monitoring/alerts/rules` | GET | none | rules list | auth/session errors |
| `/api/monitoring/alerts/rules` | POST | rule body consumed by `upsertRule` | `{ok,id}` | validation/runtime errors from rule store |
| `/api/monitoring/alerts/rules/:id/test` | POST | path `id` | `{ok,channels}` (test notify result) | `not_found` (404), snapshot/notify failures |
| `/api/monitoring/alerts/rules/:id/delete` | POST | path `id` | `{ok:true}` | runtime rule-delete errors |
| `/api/monitoring/alerts/active` | GET | none | active alerts list | auth/session errors |
| `/api/monitoring/alerts/resolved` | GET | none | resolved alerts list | auth/session errors |
| `/api/monitoring/alerts/:ruleId/ack` | POST | path `ruleId`, optional `duration_sec` | `{ok:true}` | runtime ack errors |
| `/api/monitoring/alerts/:ruleId/silence` | POST | path `ruleId`, optional `duration_sec` | `{ok:true}` | runtime silence errors |

## Notes
- Channel names are validated by `isValidChannel(channel)` before log endpoints are served.
- `duration_sec` defaults: ack=600, silence=900.
- Most endpoints return `sendJson(...)`; export endpoints return file/stream responses.

## Known unknowns
- **(D)** exact schema of settings payloads for channel config, alert config, and monitoring rule object is delegated to helper modules (`updateChannelSettings`, `updateAlertSettings`, `upsertRule`) and may evolve independently.
