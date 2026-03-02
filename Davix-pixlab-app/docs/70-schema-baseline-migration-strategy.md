# Schema Baseline Migration Strategy

## Canonical baseline source

- Canonical schema source of truth: `db/davix_pixlab.sql`.
- Migration baseline file: `migrations/000_canonical_schema_baseline.sql`.
- The baseline is structure-only and migration-safe:
  - no `DROP TABLE`
  - no `CREATE DATABASE` / `USE`
  - no data inserts

## Regenerating `000_canonical_schema_baseline.sql`

When canonical schema changes, regenerate baseline from `db/davix_pixlab.sql` by copying only `CREATE TABLE` and `ALTER TABLE` statements needed for schema structure, indexes, auto-increment, and foreign keys.

Important:
- Preserve engines, charsets, and collations exactly as canonical.
- Keep foreign keys and index names exactly as canonical.
- `schema_migrations` is managed by `db.js` bootstrap (`ensureSchemaMigrationsTable`) and is intentionally excluded from `000` to avoid conflict with runner bootstrap.

## Fresh install workflow

`db.js` migration runner behavior:

1. Ensure `schema_migrations` exists.
2. Detect fresh DB when either:
   - `schema_migrations` has zero rows, or
   - there are no application tables other than `schema_migrations`.
3. On fresh DB:
   - apply `000_canonical_schema_baseline.sql`
   - mark legacy migrations (`001`..`013`) as applied without executing their SQL
   - continue with any newer migrations not superseded.

## Non-fresh behavior

- Existing/non-fresh deployments keep prior behavior and are not forced to run `000_canonical_schema_baseline.sql`.
- If `000` is absent from migration history on non-fresh DBs, it remains unapplied by design.
- Applying `000` to a populated DB is a manual, explicit operation only (not automated by startup migration flow).
