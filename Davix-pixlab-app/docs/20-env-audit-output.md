# ENV Audit Output (Rebuilt from Current Code)

## Totals
- Runtime env keys: **188**
- Script-only env keys: **9**
- Combined referenced keys: **197**

## ENV_FILE classification
- `ENV_FILE`: **runtime-supported**.
- Runtime/bootstrap behavior is implemented in `utils/loadEnv.js` and executed by `server.js`.
- Script entrypoints that import `utils/loadEnv` also honor `ENV_FILE`.

## Runtime env list (188)
Reference source of truth: `docs/16-env-reference.md` (updated in this audit).

## Script-only env list (9)
- `REPRO_API_KEY`
- `REPRO_BASE_URL`
- `SIMULATE_ALERT_EMAIL_RECIPIENTS`
- `SIMULATE_ALERT_TELEGRAM_TARGETS`
- `SMOKE_API_KEY`
- `TEST_CUSTOMER_EMAIL`
- `TEST_PLAN_SLUG`
- `TEST_SUBSCRIPTION_ID`
- `VERIFY_BASE_URL`

## Deprecated aliases
- No active runtime `*_MS` env aliases were found.
- Canonical unit-aware keys in code are `*_S`, `*_MIN`, `*_H`, `_DAYS`, `_HOURS`, `_SECONDS`.

## Unsupported-but-documented vars
- None found in this pass after updates.

## Notes
- Fallback behavior when `ENV_FILE` is unset is code-enforced: use `<repo>/.env` if present; otherwise continue with already-exported process env.
