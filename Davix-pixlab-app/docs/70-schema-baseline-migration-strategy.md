# 70 - Schema Baseline Migration Strategy (db/davix_pixlab.sql parity)

## Discovery Report

### 1) How migrations run today

- Migration commands are script-driven via npm:
  - `npm run migrate` → `node scripts/migrate.js`
  - `npm run migrations:status` → `node scripts/migrations-status.js`
  - `npm run migrations:rerun-check` → `node scripts/migrations-rerun-check.js`. 
- The app uses `mysql2` (`mysql2/promise`) as the DB driver; no ORM/knex/prisma layer is used. 
- The migration runner is implemented in `db.js` (`runMigrations()`):
  - migration SQL files are loaded from `migrations/`, filtered by `.sql`, and lexicographically sorted;
  - state is tracked in `schema_migrations` (`name` unique);
  - it acquires a MySQL advisory lock (`GET_LOCK('pixlab_schema_migrations', 30)`) to serialize migration runs;
  - SQL files are executed with a dedicated migration pool configured with `multipleStatements: true`;
  - there is no explicit transaction wrapper around each migration file in runner code;
  - some known duplicate/existence errors are treated as “benign” and the migration is still marked as applied. 
- `schema_migrations` is auto-created by runner bootstrap if absent, with `id`, `name`, `applied_at`, and unique key `uq_schema_migrations_name(name)`. 
- Startup behavior:
  - server startup calls `runMigrations()` when `AUTO_RUN_MIGRATIONS` is true (default true);
  - after startup checks, migrations may be retried if schema checks still fail. 

### 2) Current migration inventory and conventions

- Existing migration files are SQL files named with zero-padded numeric prefixes (e.g., `001_...sql` through `013_...sql`) and applied by filename sort order. 
- Files 001–008 are treated by runner as “baseline files” and are auto-marked as applied on non-fresh DBs (`schema_migrations` already has rows), to avoid replaying old bootstrap logic. 
- Current migration-created tables (15):
  - `plans`, `api_keys`, `request_log`, `usage_monthly`, `subscription_events`, `quota_ledger`, `rate_limits_daily`, `burst_limits_window`, `alert_rules`, `alert_state`, `alert_events`, `lease_locks`, `alert_deliveries`, `internal_rate_limit_windows`, `admin_login_lockouts`. 
- `schema_migrations` is created outside migration files by runner bootstrap; `admin_sessions` is not created by repo migrations (it is used by `express-mysql-session` store with `tableName: 'admin_sessions'`). 

### 3) DB flavor/version assumptions from repo + dump

- Canonical dump states MariaDB `10.5.29` and UTC-oriented dump preamble (`SET time_zone = '+00:00'`). 
- Runtime pool(s) set `timezone: 'Z'` in Node MySQL connection config. 
- No explicit `sql_mode` configuration is set by app code; dump includes `SQL_MODE = "NO_AUTO_VALUE_ON_ZERO"`. 
- Charset/collation are table-specific in dump (mixed `utf8mb4_*` and `utf8_general_ci`). 

---

## Schema extraction from `db/davix_pixlab.sql`

### Canonical table set (17)

1. `admin_login_lockouts`
2. `admin_sessions`
3. `alert_deliveries`
4. `alert_events`
5. `alert_rules`
6. `alert_state`
7. `api_keys`
8. `burst_limits_window`
9. `internal_rate_limit_windows`
10. `lease_locks`
11. `plans`
12. `quota_ledger`
13. `rate_limits_daily`
14. `request_log`
15. `schema_migrations`
16. `subscription_events`
17. `usage_monthly` 

### FK graph and dependency order (topological)

From canonical constraints in dump:
- `api_keys.plan_id -> plans.id` (`ON UPDATE CASCADE`, no ON DELETE clause).
- `request_log.api_key_id -> api_keys.id` (`ON DELETE CASCADE ON UPDATE CASCADE`).
- `usage_monthly.api_key_id -> api_keys.id` (`ON DELETE CASCADE ON UPDATE CASCADE`).
- `alert_state.rule_id -> alert_rules.id` (`ON DELETE CASCADE`).
- `alert_events.rule_id -> alert_rules.id` (`ON DELETE CASCADE`). 

Safe topo creation order (tables only):
- Layer 1 (no FK deps): `plans`, `alert_rules`, `admin_sessions`, `admin_login_lockouts`, `alert_deliveries`, `burst_limits_window`, `internal_rate_limit_windows`, `lease_locks`, `quota_ledger`, `rate_limits_daily`, `schema_migrations`, `subscription_events`.
- Layer 2: `api_keys` (depends on `plans`).
- Layer 3: `alert_state`, `alert_events`, `request_log`, `usage_monthly` (depend on `alert_rules` or `api_keys`).

(Equivalent alternative: create all tables first, then add FK constraints in a final phase as dump does.)

---

## Diff: repo migrations vs canonical dump

### Missing items in repo migrations

- Missing table: `admin_sessions` (exists in canonical dump, not in migration SQL files). 
- Missing index associated with that table: `idx_admin_sessions_expires (expires)`. 
- For clean installs that do not rely on `express-mysql-session` auto-create behavior, this is a startup risk because app config points session store at `admin_sessions`. 

### Drift examples (high-impact)

1. **`plans` drift**
   - Migration defines wider/nullable columns (`plan_slug VARCHAR(190)`, many nullable ints, DATETIME timestamps). 
   - Canonical uses tighter types/defaults (`plan_slug VARCHAR(50)`, unsigned ints with defaults, TIMESTAMPs, non-null constraints on key fields). 

2. **`api_keys` drift**
   - Migration starts with `id BIGINT UNSIGNED`, `status ENUM`, `plan_id BIGINT NULL`, and fewer columns in initial CREATE shape. 
   - Canonical uses `id INT UNSIGNED`, `status VARCHAR(20)`, `plan_id INT UNSIGNED NOT NULL`, includes additional lifecycle columns (`revoked_at`, `wp_license_id`, `wp_product_id`, period/sync/activity/notes fields), and additional unique/index constraints. 

3. **`request_log` drift**
   - Migration: `endpoint/status` as free-form `VARCHAR`, `request_id VARCHAR(64)`, and simpler indexes (`idx_api_key_id`, `idx_timestamp`, `idx_endpoint`). 
   - Canonical: enum-typed `endpoint/status`, `request_id VARCHAR(128)`, and composite indexes (`idx_request_log_api_key_time`, `idx_request_log_endpoint_time`). 

4. **`usage_monthly` drift**
   - Migration uses broad BIGINT nullable counters and `period VARCHAR(32)`.
   - Canonical uses mostly `INT UNSIGNED NOT NULL` counters, includes `reserved_files`, and `period VARCHAR(128)`.

5. **Charset/collation drift**
   - Canonical sets several tables as `DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci` (e.g., `alert_rules`, `alert_events`, `alert_state`, `alert_deliveries`, `rate_limits_daily`, `burst_limits_window`, `lease_locks`, `schema_migrations`, `admin_sessions`).
   - Current migrations often omit explicit collation or default to `utf8mb4`, causing clean-install divergence from canonical.

### Extra items in repo migrations

- No additional tables beyond canonical set were detected.
- Some index names and column shapes differ (i.e., drift) rather than truly extra table objects.

### Risk analysis

- Drift can break assumptions in analytics/admin/reporting queries (index selection, enum domain guarantees, composite key access patterns).
- Collation/charset mismatch can alter sort/order comparisons and index behavior across environments.
- FK/type mismatches (e.g., `api_keys.id` INT in canonical vs BIGINT in current migrations) increase operational risk for future ALTERs and data imports.
- Missing `admin_sessions` DDL makes clean installs dependent on runtime side-effects instead of deterministic schema setup.

---

## Recommended strategy (chosen): **Strategy A**

### Why A is best for “new environment installs succeed 100%”

- The canonical dump is already a full, validated schema snapshot with all 17 tables, indexes, AUTO_INCREMENT, and FK constraints.
- Runner supports large SQL files and multi-statement execution (`multipleStatements: true` in migration pool), so a single baseline is technically compatible.
- Single canonical baseline minimizes FK ordering mistakes and removes incremental drift introduced by legacy compatibility ALTER patterns.
- It allows exact preservation of table engine/charset/collation as required.
- Operationally simplest for clean installs: one deterministic source, then future deltas as small incremental migrations.

### Caveat to address

- Current runner’s non-fresh behavior auto-marks only hard-coded baseline files `001..008`.
- If introducing a new canonical baseline, runner logic must explicitly **skip/supersede** old bootstrap files for fresh installs after applying canonical baseline, and mark them in `schema_migrations` to keep idempotency.

---

## Implementation Plan

### Files to add/change

1. **Add** `migrations/000_canonical_schema_baseline.sql`
   - Structure-only DDL derived from `db/davix_pixlab.sql`.
   - Include all 17 tables exactly (engine + charset/collation), indexes, FK constraints, AUTO_INCREMENT declarations.
   - Remove destructive dump statements (`DROP TABLE`) and keep migration-safe create/alter sequence.

2. **Change** `db.js`
   - Add a new canonical baseline constant, e.g. `CANONICAL_BASELINE_FILE = '000_canonical_schema_baseline.sql'`.
   - Add a `SUPERSEDED_BY_CANONICAL` list containing old bootstrap migrations (`001..013` as applicable).
   - Migration flow for fresh DB:
     - apply canonical baseline first;
     - insert superseded file names into `schema_migrations` via `INSERT IGNORE` without executing their SQL.
   - Migration flow for non-fresh DB:
     - keep existing baseline-mark behavior, plus mark canonical baseline as applied only when appropriate (explicitly documented rule).

3. **(Optional but recommended) Add** `docs/71-canonical-schema-source.md`
   - State `db/davix_pixlab.sql` is canonical schema source for baseline regeneration.
   - Include regeneration and validation workflow.

### Proposed migration ordering

- `000_canonical_schema_baseline.sql` (new).
- Existing `001..013` retained for historical audit, but treated as superseded for fresh installs once canonical baseline exists.
- Future migrations continue at `014_...sql` onward.

### Transaction boundaries and FK checks

- Keep default FK checks on; canonical order can create base tables first then apply FKs safely.
- Do **not** rely on a single giant transaction in runner (none exists today).
- Prefer explicit, deterministic statement ordering in migration SQL rather than temporary `SET FOREIGN_KEY_CHECKS=0` unless strictly necessary.

### Fresh-environment validation commands

```bash
# 1) create empty DB
mysql -u "$DB_USER" -p"$DB_PASS" -e "DROP DATABASE IF EXISTS pixlab_migtest; CREATE DATABASE pixlab_migtest CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;"

# 2) run migrations against empty DB
DB_NAME=pixlab_migtest npm run migrate

# 3) assert all 17 tables exist
mysql -u "$DB_USER" -p"$DB_PASS" -D pixlab_migtest -e "SELECT COUNT(*) AS table_count FROM information_schema.tables WHERE table_schema='pixlab_migtest';"

# 4) verify required FKs exist
mysql -u "$DB_USER" -p"$DB_PASS" -D pixlab_migtest -e "SELECT table_name,constraint_name,referenced_table_name FROM information_schema.referential_constraints WHERE constraint_schema='pixlab_migtest' ORDER BY table_name,constraint_name;"

# 5) verify table charset/collation parity
mysql -u "$DB_USER" -p"$DB_PASS" -D pixlab_migtest -e "SELECT table_name,table_collation FROM information_schema.tables WHERE table_schema='pixlab_migtest' ORDER BY table_name;"

# 6) app boot smoke test on fresh DB
DB_NAME=pixlab_migtest AUTO_RUN_MIGRATIONS=true npm start
```

### Concrete next steps

1. Generate `000_canonical_schema_baseline.sql` directly from `db/davix_pixlab.sql` (DDL only, migration-safe).
2. Patch `db.js` baseline/supersession logic and add tests for fresh vs non-fresh behavior.
3. Run rerun/idempotency checks (`npm run migrations:rerun-check`) against test DB.
4. Capture schema parity checks and document expected outputs in docs.

