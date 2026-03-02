# 50 - PixLab Database Schema & Data Model (Exhaustive)

## Scope and sources scanned
This document is derived from:

1. `migrations/*.sql` (schema source of truth for migrated tables).
2. `db.js` migration runner and `schema_migrations` bootstrap.
3. Runtime SQL in routes/utils (`usage.js`, `utils/*`, `routes/subscription-route.js`, `server.js`, `admin/*`).

No assumptions are made for schema details that are not present in repository migrations/runtime SQL.

---

## ER-style diagram (ASCII)

```text
plans (id) 1 --- * api_keys (plan_id nullable)
api_keys (id) 1 --- * usage_monthly (api_key_id)
api_keys (id) 1 --- * request_log (api_key_id)
api_keys (id) 1 --- * quota_ledger (api_key_id)
api_keys (id) 1 --- * burst_limits_window (api_key_id)
api_keys (id) 1 --- * subscription_events (api_key_id, logical)

alert_rules (id) 1 --- 1 alert_state (rule_id FK)
alert_rules (id) 1 --- * alert_events (rule_id FK)

lease_locks(name PK) is a shared lock table used by alert engine.
schema_migrations(name unique) tracks applied SQL migrations.
admin_sessions is part of canonical baseline schema and runtime-referenced by express session store.

rate_limits_daily is standalone (keyed by day_utc + scope + ip).
```

---

## Migration / upgrade workflow

### How migrations are executed
- `db.js` exports `runMigrations()`, which:
  - Ensures `schema_migrations` exists.
  - Reads and sorts all `migrations/*.sql` files.
  - Applies each file in a transaction and records it in `schema_migrations`.
  - On non-fresh DBs, marks baseline files as already applied when appropriate.
- Startup path (`server.js`): `startServer()` runs migrations when `getAutoRunMigrations()` is true.
- `AUTO_RUN_MIGRATIONS` is parsed in `utils/config.js` with default `true`.

### Manual migration command
- `package.json` defines `npm run migrate` => `node scripts/migrate.js`.
- `scripts/migrate.js` just executes `runMigrations()` and exits non-zero on failure.

### Runtime schema guardrails (post-migration checks)
- `ensureRequestLogSchema()` can create/patch `request_log` and its unique index at runtime.
- `server.js` has additional schema checks for required columns/indexes in `usage_monthly`, `request_log`, and `quota_ledger`; production exits if required schema is missing.

---

## Table-by-table schema and data model

## 1) `plans`
**Purpose / subsystem**
- Plan catalog for quota/features (`subscription` and key provisioning flows).

**Creation migration**
- `migrations/000_canonical_schema_baseline.sql`.

**Columns**
- `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT
- `plan_slug` VARCHAR(190) NOT NULL
- `name` VARCHAR(255) NULL
- `billing_period` VARCHAR(64) NULL
- `monthly_quota_files` INT NULL
- `max_files_per_request` INT NULL
- `max_total_upload_mb` INT NULL
- `max_dimension_px` INT NULL
- `timeout_seconds` INT NULL
- `allow_h2i` TINYINT(1) NULL DEFAULT 1
- `allow_image` TINYINT(1) NULL DEFAULT 1
- `allow_pdf` TINYINT(1) NULL DEFAULT 1
- `allow_tools` TINYINT(1) NULL DEFAULT 1
- `is_free` TINYINT(1) NULL DEFAULT 0
- `description` TEXT NULL
- `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
- `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP

**PK / unique constraints**
- PK: `id`
- Unique: `uniq_plan_slug (plan_slug)`

**Indexes**
- `uniq_plan_slug`

**Foreign-key-like relations**
- Referenced by `api_keys.plan_id` (`fk_api_keys_plan` in migration 002).

**Retention / cleanup**
- No plan-table cleanup job found.

**Read/write in code**
- Reads in key/provisioning logic: `utils/customerKeys.js` (`loadFreePlan`, `resolvePlanId`).
- Reads/writes in admin/internal subscription routes: `routes/subscription-route.js` (`findPlanRow`, admin plans upsert/list endpoints).

---

## 2) `api_keys`
**Purpose / subsystem**
- Canonical API credential identity and lifecycle table (auth, entitlement, subscription sync).

**Creation migration**
- `migrations/000_canonical_schema_baseline.sql`.

**Columns (final shape from create + alter blocks in same migration)**
- `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT
- `key_prefix` VARCHAR(32) NOT NULL
- `key_last4` VARCHAR(4) NULL
- `key_hash` VARCHAR(255) NOT NULL
- `status` ENUM('active','disabled') NOT NULL DEFAULT 'active'
- `plan_id` BIGINT NULL
- `customer_email` VARCHAR(190) NULL
- `customer_name` VARCHAR(190) NULL
- `subscription_id` VARCHAR(190) NULL
- `order_id` VARCHAR(190) NULL
- `subscription_status` VARCHAR(190) NULL
- `valid_from` DATETIME NULL
- `valid_until` DATETIME NULL
- `metadata_json` JSON NULL
- `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
- `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- `license_key` VARCHAR(255) NULL (deprecated legacy)
- `wp_order_id` BIGINT NULL (deprecated)
- `wp_subscription_id` BIGINT NULL (deprecated)
- `wp_user_id` BIGINT NULL (deprecated identity path but still used)
- `rotated_at` DATETIME NULL

**PK / unique constraints**
- PK: `id`
- Unique: `uniq_key_prefix (key_prefix)`
- Unique: `uniq_api_keys_wp_user_id (wp_user_id)`
- Unique: `uniq_api_keys_customer_email (customer_email)`

**Indexes**
- `idx_api_keys_plan_id (plan_id)`
- `idx_api_keys_customer_email (customer_email)`
- `idx_api_keys_subscription_id (subscription_id)`
- `idx_api_keys_status_valid_until_id (status, valid_until, id)`

**Foreign keys / relations**
- Declared FK to `plans(id)` as `fk_api_keys_plan` with `ON UPDATE CASCADE ON DELETE SET NULL`.
- Parent table for `request_log`, `usage_monthly` FK constraints.
- Logical relation to `subscription_events.api_key_id` (no declared FK).

**Retention / cleanup**
- Expiry watcher:
  - Disables active keys whose `valid_until < NOW()`.
  - Deletes rows where `subscription_status='expired' AND status='disabled'`.

**Read/write in code**
- Key lookup/provision/update/disable: `utils/customerKeys.js` (`findCustomerKeyByPlaintext`, `activateOrProvisionKey`, `disableCustomerKey`, `upgradeLegacyKey`).
- Admin/internal subscription operations and rotation: `routes/subscription-route.js`.
- Expiry cleanup and normalization: `utils/expiryWatcher.js`.

---

## 3) `request_log`
**Purpose / subsystem**
- Per-request audit log (endpoint/action/status/traffic/errors/idempotency).

**Creation migration**
- `migrations/000_canonical_schema_baseline.sql`.

**Columns (final shape from create + alter blocks)**
- `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT
- `api_key_id` BIGINT NOT NULL
- `request_id` VARCHAR(64) NULL (migration add)
- `timestamp` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
- `endpoint` VARCHAR(32) NULL
- `action` VARCHAR(64) NULL
- `status` VARCHAR(32) NULL
- `ip` VARCHAR(64) NULL
- `user_agent` VARCHAR(255) NULL
- `bytes_in` BIGINT NULL DEFAULT 0
- `bytes_out` BIGINT NULL DEFAULT 0
- `files_processed` INT NULL DEFAULT 0
- `error_code` VARCHAR(64) NULL
- `error_message` TEXT NULL
- `params_json` JSON NULL
- `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP

**PK / unique constraints**
- PK: `id`
- Unique: `uq_request_log_api_key_id_request_id (api_key_id, request_id)`

**Indexes**
- `idx_api_key_id (api_key_id)`
- `idx_timestamp (timestamp)`
- `idx_endpoint (endpoint)`
- `uq_request_log_api_key_id_request_id`

**Foreign keys / relations**
- Declared FK `fk_request_log_api_key` to `api_keys(id)` with cascade delete/update.

**Retention / cleanup**
- Retention cleanup deletes old rows by `created_at` with configurable days.
- Orphan cleanup deletes rows whose `api_key_id` no longer exists.

**Read/write in code**
- Writes during quota finalize and usage logging: `usage.js` (`finalizeQuota`, `recordUsageAndLog`).
- Dynamic schema ensure / inserts: `utils/requestLog.js` (`ensureRequestLogSchema`, `insertRequestLogRow`, diagnostics probe).
- Read/reporting/admin exports in `routes/subscription-route.js` (paginated stats/series queries).

---

## 4) `usage_monthly`
**Purpose / subsystem**
- Aggregated per-key, per-period usage + reservation counters.

**Creation migration**
- `migrations/000_canonical_schema_baseline.sql`.

**Columns (final shape from create + alter blocks)**
- `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT
- `api_key_id` BIGINT UNSIGNED NOT NULL
- `period` VARCHAR(32) NOT NULL
- `used_files` BIGINT NULL DEFAULT 0
- `reserved_files` BIGINT NOT NULL DEFAULT 0 (added by migration alter)
- `used_bytes` BIGINT NULL DEFAULT 0
- `total_calls` BIGINT NULL DEFAULT 0
- `total_files_processed` BIGINT NULL DEFAULT 0
- `h2i_calls` BIGINT NULL DEFAULT 0
- `h2i_files` BIGINT NULL DEFAULT 0
- `image_calls` BIGINT NULL DEFAULT 0
- `image_files` BIGINT NULL DEFAULT 0
- `pdf_calls` BIGINT NULL DEFAULT 0
- `pdf_files` BIGINT NULL DEFAULT 0
- `tools_calls` BIGINT NULL DEFAULT 0
- `tools_files` BIGINT NULL DEFAULT 0
- `bytes_in` BIGINT NULL DEFAULT 0
- `bytes_out` BIGINT NULL DEFAULT 0
- `errors` BIGINT NULL DEFAULT 0
- `last_error_code` VARCHAR(64) NULL
- `last_error_message` TEXT NULL
- `last_request_at` DATETIME NULL
- `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
- `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP

**PK / unique constraints**
- PK: `id`
- No unique constraint on `(api_key_id, period)` is declared in migration.

**Indexes**
- `idx_usage_monthly_api_key_id (api_key_id)`
- `idx_usage_monthly_period (period)`
- `idx_usage_monthly_api_key_period (api_key_id, period)`

**Foreign keys / relations**
- Declared FK `fk_usage_monthly_api_key` to `api_keys(id)` with cascade delete/update.

**Retention / cleanup**
- Retention cleanup deletes old rows by `created_at` with configurable months.
- Orphan cleanup deletes rows with missing `api_keys` parent.
- Ledger reclaim decrements `reserved_files` for expired reservations.

**Read/write in code**
- Core quota reservation/finalization/refund and usage accumulation: `usage.js` (`getOrCreateUsageForKey`, `reserveQuota`, `finalizeQuota`, `refundQuota`, `recordUsageAndLog`).
- Used for subscription/internal usage responses in `routes/subscription-route.js` (`findUsageRow` and series endpoints).
- Updated by ledger reclaim: `utils/ledgerReclaim.js`.

---

## 5) `subscription_events`
**Purpose / subsystem**
- Immutable-ish audit/event inbox for subscription/license webhook normalization and admin review/export.

**Creation migration**
- `migrations/000_canonical_schema_baseline.sql`.

**Columns**
- `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT
- `event_id` VARCHAR(190) NOT NULL
- `received_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
- `normalized_event` VARCHAR(64) NULL
- `wp_user_id` BIGINT NULL
- `customer_email` VARCHAR(190) NULL
- `subscription_id` VARCHAR(190) NULL
- `order_id` VARCHAR(190) NULL
- `plan_slug` VARCHAR(190) NULL
- `valid_from` DATETIME NULL
- `valid_until` DATETIME NULL
- `decision` VARCHAR(32) NULL
- `api_key_id` BIGINT NULL
- `error_message` TEXT NULL
- `payload_json` JSON NULL

**PK / unique constraints**
- PK: `id`
- Unique: `uniq_subscription_events_event_id (event_id)`

**Indexes**
- `idx_subscription_events_received_at`
- `idx_subscription_events_decision`
- `idx_subscription_events_customer_email`
- `idx_subscription_events_subscription_id`
- `idx_subscription_events_order_id`
- `idx_subscription_events_wp_user_id`
- `idx_subscription_events_api_key_id`

**Foreign-key-like relations**
- `api_key_id` logically references `api_keys.id` but no FK declared.
- `plan_slug` logically references `plans.plan_slug` but no FK declared.

**Retention / cleanup**
- Dedicated cleanup job deletes rows older than configured retention days (`utils/subscriptionEventsCleanup.js` + `utils/subscriptionEvents.js`).

**Read/write in code**
- Insert/update/find/list/export/CSV in `utils/subscriptionEvents.js`.
- Cleanup scheduler in `utils/subscriptionEventsCleanup.js` and started from `server.js`.

---

## 6) `quota_ledger`
**Purpose / subsystem**
- Idempotent quota reservation ledger (`reserved` -> `finalized` / `refunded` / `expired`).

**Creation migration**
- `migrations/000_canonical_schema_baseline.sql`.

**Columns**
- `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT
- `api_key_id` BIGINT UNSIGNED NOT NULL
- `period` VARCHAR(32) NOT NULL
- `dedupe_id` VARCHAR(128) NOT NULL
- `endpoint` VARCHAR(32) NULL
- `action` VARCHAR(64) NULL
- `reserve_units` BIGINT NOT NULL DEFAULT 0
- `finalized_units` BIGINT NOT NULL DEFAULT 0
- `status` VARCHAR(32) NOT NULL
- `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
- `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
- `expires_at` DATETIME NULL

**PK / unique constraints**
- PK: `id`
- Unique: `uq_quota_ledger_api_key_dedupe (api_key_id, dedupe_id)`

**Indexes**
- `idx_quota_ledger_status_expires (status, expires_at)`
- `idx_quota_ledger_api_key_id (api_key_id)`
- `idx_quota_ledger_created_at (created_at)`

**Foreign-key-like relations**
- `api_key_id` is a logical relation to `api_keys.id`; no FK declared.

**Retention / cleanup**
- Reclaim job marks expired `reserved` rows as `expired` and releases `usage_monthly.reserved_files`.
- Cleanup job deletes old rows by `created_at` retention days.

**Read/write in code**
- Reserve/finalize/refund idempotency path in `usage.js`.
- Reclaim in `utils/ledgerReclaim.js`.
- Retention delete in `utils/ledgerCleanup.js`.

---

## 7) `rate_limits_daily`
**Purpose / subsystem**
- Daily per-IP+scope counters for external rate limiting.

**Creation migration**
- `migrations/000_canonical_schema_baseline.sql`.

**Columns**
- `day_utc` DATE NOT NULL
- `scope` VARCHAR(32) NOT NULL
- `ip` VARBINARY(16) NOT NULL
- `count` INT UNSIGNED NOT NULL DEFAULT 0
- `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP

**PK / unique constraints**
- Composite PK: `(day_utc, scope, ip)`

**Indexes**
- `idx_rate_limits_daily_updated_at (updated_at)`

**Foreign-key-like relations**
- None declared.

**Retention / cleanup**
- Optional retention delete by `day_utc` in `utils/retentionCleanup.js`.

**Read/write in code**
- Increment and fetch count in `utils/rateLimitsDaily.js` (`incrementAndGetDailyCount`).
- Applied by rate-limit middleware paths in `routes/h2i-route.js` and `routes/image-route.js`.

---

## 8) `burst_limits_window`
**Purpose / subsystem**
- Short-window burst control per `api_key_id + scope`.

**Creation migration**
- `migrations/000_canonical_schema_baseline.sql`.

**Columns**
- `window_start` DATETIME NOT NULL
- `api_key_id` BIGINT UNSIGNED NOT NULL
- `scope` VARCHAR(32) NOT NULL
- `count` INT UNSIGNED NOT NULL DEFAULT 0
- `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP

**PK / unique constraints**
- Composite PK: `(window_start, api_key_id, scope)`

**Indexes**
- `idx_burst_limits_updated_at (updated_at)`

**Foreign-key-like relations**
- `api_key_id` is logical relation to `api_keys.id`; no FK declared.

**Retention / cleanup**
- Optional retention delete by `window_start` in `utils/retentionCleanup.js`.

**Read/write in code**
- Increment path in `utils/burstLimits.js` (`incrementAndGetBurstCount`).
- Used via burst middleware in `utils/burstLimitMiddleware.js`.

---

## 9) Monitoring / alerts tables

### 9a) `alert_rules`
**Purpose**
- Alert rule definitions (metric, operator, threshold, channels, severity).

**Creation migration**
- `migrations/000_canonical_schema_baseline.sql`.

**Columns**
- `id` INT UNSIGNED NOT NULL AUTO_INCREMENT
- `name` VARCHAR(255) NOT NULL
- `enabled` TINYINT(1) NOT NULL DEFAULT 1
- `metric_key` VARCHAR(64) NOT NULL
- `scope_json` TEXT NULL
- `operator` VARCHAR(8) NOT NULL DEFAULT '>'
- `threshold` DOUBLE NOT NULL DEFAULT 0
- `for_sec` INT UNSIGNED NOT NULL DEFAULT 0
- `eval_interval_sec` INT UNSIGNED NOT NULL DEFAULT 10
- `cooldown_sec` INT UNSIGNED NOT NULL DEFAULT 0
- `severity` VARCHAR(16) NOT NULL DEFAULT 'warn'
- `channels_json` TEXT NULL
- `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
- `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP

**PK / unique / indexes**
- PK: `id`
- No extra unique/index in migration.

**Read/write in code**
- CRUD in `utils/alertEngine.js` (`listRules`, `upsertRule`, `deleteRule`).

### 9b) `alert_state`
**Purpose**
- Current state per rule (`OK/FIRING/RESOLVED`, ack/silence windows, last snapshot metadata).

**Creation migration**
- `migrations/000_canonical_schema_baseline.sql`.

**Columns**
- `rule_id` INT UNSIGNED NOT NULL
- `state` VARCHAR(16) NOT NULL DEFAULT 'OK'
- `last_change_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
- `last_fire_at` DATETIME NULL
- `last_eval_at` DATETIME NULL
- `pending_since` DATETIME NULL
- `ack_until` DATETIME NULL
- `silence_until` DATETIME NULL
- `last_snapshot_path` TEXT NULL
- `last_message` TEXT NULL
- `last_value` DOUBLE NULL

**PK / unique / indexes**
- PK: `rule_id`

**Foreign key**
- FK `fk_alert_state_rule (rule_id)` references `alert_rules(id)` ON DELETE CASCADE.

**Read/write in code**
- Read/update/upsert paths in `utils/alertEngine.js` (`listActiveAlerts`, `listResolvedAlerts`, `ackAlert`, `silenceAlert`, `upsertState`, `evaluateAlerts`).

### 9c) `alert_events`
**Purpose**
- Event history for alert transitions.

**Creation migration**
- `migrations/000_canonical_schema_baseline.sql`.

**Columns**
- `id` INT UNSIGNED NOT NULL AUTO_INCREMENT
- `rule_id` INT UNSIGNED NOT NULL
- `state` VARCHAR(16) NOT NULL
- `value` DOUBLE NULL
- `message` TEXT NULL
- `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP

**PK / unique / indexes**
- PK: `id`
- Index: `idx_alert_events_rule (rule_id)`

**Foreign key**
- FK `fk_alert_events_rule (rule_id)` references `alert_rules(id)` ON DELETE CASCADE.

**Read/write in code**
- Insert in `utils/alertEngine.js` (`recordEvent`).

### 9d) `lease_locks`
**Purpose**
- Leases used by alert engine leader election.

**Creation migration**
- `migrations/000_canonical_schema_baseline.sql`.

**Columns**
- `name` VARCHAR(64) NOT NULL
- `owner_id` VARCHAR(128) NOT NULL
- `lease_until` DATETIME NOT NULL
- `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP

**PK / unique / indexes**
- PK: `name`

**Read/write in code**
- Read/upsert in `utils/alertEngine.js` (`acquireLease`).

---

## 10) Runtime/system tables

### 10a) `schema_migrations`
**Status**
- **Referenced and created in code (not via migration file)**.

**Creation source**
- `db.js` in `runMigrations()` executes `CREATE TABLE IF NOT EXISTS schema_migrations (...)`.

**Columns**
- `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PK
- `name` VARCHAR(255) NOT NULL UNIQUE
- `applied_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP

**Usage**
- Migration history read/write in `db.js`.

### 10b) `admin_sessions`
**Status**
- **Created by canonical baseline migration and used by runtime session store/cleanup.**

**Creation source**
- `migrations/000_canonical_schema_baseline.sql` creates `admin_sessions` with primary key and expires index.

**What is known from code**
- Session store configured with table name `admin_sessions` in `server.js` via `express-mysql-session`.
- Cleanup query exists: `DELETE FROM admin_sessions WHERE expires < (UTC_TIMESTAMP() - INTERVAL ? DAY)`.

**Query/reference locations**
- `server.js` session store config (`tableName: 'admin_sessions'`).
- `server.js` `cleanupAdminSessions()` delete statement.

**Columns / constraints**
- Declared in baseline migration (`session_id`, `expires`, `data`) with PK on `session_id` and index `idx_admin_sessions_expires`.

---

## Table-to-module mapping

| Table | Primary modules/functions that read/write it |
|---|---|
| `plans` | `utils/customerKeys.js` (`loadFreePlan`, `resolvePlanId`), `routes/subscription-route.js` (plan lookup/upsert/list) |
| `api_keys` | `utils/customerKeys.js`, `routes/subscription-route.js`, `utils/expiryWatcher.js` |
| `usage_monthly` | `usage.js` (all quota/usage flows), `routes/subscription-route.js` usage endpoints, `utils/ledgerReclaim.js`, `utils/orphanCleanup.js`, `utils/retentionCleanup.js` |
| `quota_ledger` | `usage.js` (reserve/finalize/refund), `utils/ledgerReclaim.js`, `utils/ledgerCleanup.js` |
| `request_log` | `usage.js`, `utils/requestLog.js`, `routes/subscription-route.js` reporting, `utils/orphanCleanup.js`, `utils/retentionCleanup.js` |
| `rate_limits_daily` | `utils/rateLimitsDaily.js`, route-level rate-limit middleware callers, `utils/retentionCleanup.js` |
| `burst_limits_window` | `utils/burstLimits.js`, `utils/burstLimitMiddleware.js`, `utils/retentionCleanup.js` |
| `subscription_events` | `utils/subscriptionEvents.js`, `utils/subscriptionEventsCleanup.js`, `server.js` startup scheduler |
| `alert_rules` / `alert_state` / `alert_events` / `lease_locks` | `utils/alertEngine.js` |
| `schema_migrations` | `db.js` (`runMigrations`) |
| `admin_sessions` | `server.js` (`express-mysql-session` store + cleanup) |

---

## Runtime/system table creation notes

1. **`schema_migrations`**
   - Created by `db.js` migration runner bootstrap (`ensureSchemaMigrationsTable`) rather than by the baseline SQL file.

2. **`admin_sessions`**
   - Created by `migrations/000_canonical_schema_baseline.sql` and used by runtime session store + cleanup flows.
