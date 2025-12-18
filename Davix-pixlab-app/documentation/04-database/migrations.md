# Migrations

SQL files in `migrations/` are executed in lexical order by `scripts/run-migrations.js`, tracked via the `schema_migrations` table. Each migration runs inside a transaction; failures roll back and stop execution.
