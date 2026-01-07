# PixLab Admin Desk Environment Reference

This document describes environment variables used by the Admin Desk, logging channels, and alerting.

## Admin URL + Session
- `ADMIN_PATH` (default: `acp`)
  - URL segment for the admin base path.
  - Final base URL: `/${ADMIN_PATH}/${ADMIN_PASS}`.
- `ADMIN_PASS` (required in production)
  - Secret path segment for the admin URL.
  - Changing this invalidates old URLs (no redirects).
- `ADMIN_SESSION_SECRET` (required in production)
  - Secret used to sign admin sessions.

## Admin Authentication
- `ADMIN_PASSWORD_HASH` (required in production)
  - Password hash for admin login.
  - Accepted formats: bcrypt/argon2/scrypt (same verification as API keys).
- `ADMIN_PASSWORD` (dev-only fallback)
  - Plaintext password used only when `ADMIN_PASSWORD_HASH` is absent and `NODE_ENV != production`.
- `ADMIN_TOTP_SECRET` (required in production)
  - TOTP secret (base32) used for admin 2FA.
  - In dev, if missing, use the one-time bootstrap route to display a generated secret.

## Login Rate Limiting
- `ADMIN_LOGIN_MAX_ATTEMPTS` (default: `5`)
  - Max failed attempts within the window.
- `ADMIN_LOGIN_WINDOW_MINUTES` (default: `15`)
  - Minutes to track failed attempts.
- `ADMIN_LOGIN_LOCK_MINUTES` (default: `15`)
  - Lockout duration after max failures.

## Logging Channels
- `ADMIN_AUDIT_LOG_ENABLED` (default: `1`)
  - Controls audit log write enablement. When disabled, `logs/audit.log` and rotated logs are deleted.
  - Accepted values: `true/false/1/0`.

## Alerting (Email)
- `ALERT_EMAIL_HOST`
- `ALERT_EMAIL_PORT` (default: `587`)
- `ALERT_EMAIL_SECURE` (default: `false`)
- `ALERT_EMAIL_USER`
- `ALERT_EMAIL_PASS`
- `ALERT_EMAIL_FROM` (default: `ALERT_EMAIL_USER`)

## Alerting (Telegram)
- `ALERT_TELEGRAM_BOT_TOKEN`

## Alert Template Tokens
Templates in the admin UI can use these tokens:
- `{time}`
- `{level}`
- `{channel}`
- `{event}`
- `{request_id}`
- `{method}`
- `{path}`
- `{endpoint}`
- `{action}`
- `{status}`
- `{code}`
- `{message}`
- `{ip}`
- `{ua}`
- `{duration_ms}`

