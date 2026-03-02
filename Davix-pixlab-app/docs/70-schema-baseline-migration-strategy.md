# Schema Baseline Migration Strategy

## Canonical baseline source

- Canonical schema source of truth: `db/davix_pixlab.sql`.
- Migration baseline file: `migrations/000_canonical_schema_baseline.sql`.

## Migration safety controls (commercial-grade)

`db.js` migration runner enforces all of the following:

1. `schema_migrations` stores `name`, `checksum` (SHA256), `applied`, `started_at`, and `applied_at`.
2. If a migration was recorded previously and the current file checksum differs, startup/migration **fails fast**.
3. If a migration row is found with `applied != 1` (partial/incomplete), startup/migration **fails fast**.
4. Each new migration is executed in explicit SQL transaction (`START TRANSACTION` / `COMMIT`, with `ROLLBACK` on failure).
5. After running migrations, schema integrity checks validate required tables, required columns, and required indexes; mismatch fails startup.

## Operational commands

- Apply migrations: `npm run migrate`
- Verify migration + schema integrity: `npm run verify-schema`

`verify-schema` returns non-zero if there are pending migrations, duplicate/partial migration records, or schema drift.
