CREATE TABLE IF NOT EXISTS quota_ledger (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  api_key_id BIGINT UNSIGNED NOT NULL,
  period VARCHAR(32) NOT NULL,
  dedupe_id VARCHAR(128) NOT NULL,
  endpoint VARCHAR(32) NULL,
  action VARCHAR(64) NULL,
  reserve_units BIGINT NOT NULL DEFAULT 0,
  finalized_units BIGINT NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  expires_at DATETIME NULL,
  UNIQUE KEY uq_quota_ledger_api_key_dedupe (api_key_id, dedupe_id),
  KEY idx_quota_ledger_status_expires (status, expires_at),
  KEY idx_quota_ledger_api_key_id (api_key_id),
  KEY idx_quota_ledger_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'quota_ledger'
    AND column_name = 'api_key_id'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE quota_ledger ADD COLUMN api_key_id BIGINT UNSIGNED NOT NULL AFTER id',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'quota_ledger'
    AND column_name = 'period'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE quota_ledger ADD COLUMN period VARCHAR(32) NOT NULL AFTER api_key_id',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'quota_ledger'
    AND column_name = 'dedupe_id'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE quota_ledger ADD COLUMN dedupe_id VARCHAR(128) NOT NULL AFTER period',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'quota_ledger'
    AND column_name = 'endpoint'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE quota_ledger ADD COLUMN endpoint VARCHAR(32) NULL AFTER dedupe_id',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'quota_ledger'
    AND column_name = 'action'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE quota_ledger ADD COLUMN action VARCHAR(64) NULL AFTER endpoint',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'quota_ledger'
    AND column_name = 'reserve_units'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE quota_ledger ADD COLUMN reserve_units BIGINT NOT NULL DEFAULT 0 AFTER action',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'quota_ledger'
    AND column_name = 'finalized_units'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE quota_ledger ADD COLUMN finalized_units BIGINT NOT NULL DEFAULT 0 AFTER reserve_units',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'quota_ledger'
    AND column_name = 'status'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE quota_ledger ADD COLUMN status VARCHAR(32) NOT NULL AFTER finalized_units',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'quota_ledger'
    AND column_name = 'created_at'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE quota_ledger ADD COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER status',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'quota_ledger'
    AND column_name = 'updated_at'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE quota_ledger ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'quota_ledger'
    AND column_name = 'expires_at'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE quota_ledger ADD COLUMN expires_at DATETIME NULL AFTER updated_at',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'quota_ledger'
    AND index_name = 'uq_quota_ledger_api_key_dedupe'
);
SET @sql := IF(
  @index_exists = 0,
  'ALTER TABLE quota_ledger ADD UNIQUE KEY uq_quota_ledger_api_key_dedupe (api_key_id, dedupe_id)',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'quota_ledger'
    AND index_name = 'idx_quota_ledger_status_expires'
);
SET @sql := IF(
  @index_exists = 0,
  'ALTER TABLE quota_ledger ADD KEY idx_quota_ledger_status_expires (status, expires_at)',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'quota_ledger'
    AND index_name = 'idx_quota_ledger_api_key_id'
);
SET @sql := IF(
  @index_exists = 0,
  'ALTER TABLE quota_ledger ADD KEY idx_quota_ledger_api_key_id (api_key_id)',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'quota_ledger'
    AND index_name = 'idx_quota_ledger_created_at'
);
SET @sql := IF(
  @index_exists = 0,
  'ALTER TABLE quota_ledger ADD KEY idx_quota_ledger_created_at (created_at)',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
