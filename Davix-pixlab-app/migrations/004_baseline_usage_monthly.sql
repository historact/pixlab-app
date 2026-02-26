CREATE TABLE IF NOT EXISTS usage_monthly (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  api_key_id BIGINT UNSIGNED NOT NULL,
  period VARCHAR(32) NOT NULL,
  used_files BIGINT NULL DEFAULT 0,
  used_bytes BIGINT NULL DEFAULT 0,
  total_calls BIGINT NULL DEFAULT 0,
  total_files_processed BIGINT NULL DEFAULT 0,
  h2i_calls BIGINT NULL DEFAULT 0,
  h2i_files BIGINT NULL DEFAULT 0,
  image_calls BIGINT NULL DEFAULT 0,
  image_files BIGINT NULL DEFAULT 0,
  pdf_calls BIGINT NULL DEFAULT 0,
  pdf_files BIGINT NULL DEFAULT 0,
  tools_calls BIGINT NULL DEFAULT 0,
  tools_files BIGINT NULL DEFAULT 0,
  bytes_in BIGINT NULL DEFAULT 0,
  bytes_out BIGINT NULL DEFAULT 0,
  errors BIGINT NULL DEFAULT 0,
  last_error_code VARCHAR(64) NULL,
  last_error_message TEXT NULL,
  last_request_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_usage_monthly_api_key_id (api_key_id),
  KEY idx_usage_monthly_period (period),
  KEY idx_usage_monthly_api_key_period (api_key_id, period),
  KEY idx_usage_monthly_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'usage_monthly'
    AND column_name = 'api_key_id'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE usage_monthly ADD COLUMN api_key_id BIGINT UNSIGNED NOT NULL AFTER id',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'usage_monthly'
    AND column_name = 'period'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE usage_monthly ADD COLUMN period VARCHAR(32) NOT NULL AFTER api_key_id',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'usage_monthly'
    AND column_name = 'used_files'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE usage_monthly ADD COLUMN used_files BIGINT NULL DEFAULT 0 AFTER period',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'usage_monthly'
    AND column_name = 'used_bytes'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE usage_monthly ADD COLUMN used_bytes BIGINT NULL DEFAULT 0 AFTER used_files',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'usage_monthly'
    AND column_name = 'total_calls'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE usage_monthly ADD COLUMN total_calls BIGINT NULL DEFAULT 0 AFTER used_bytes',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'usage_monthly'
    AND column_name = 'total_files_processed'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE usage_monthly ADD COLUMN total_files_processed BIGINT NULL DEFAULT 0 AFTER total_calls',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'usage_monthly'
    AND column_name = 'h2i_calls'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE usage_monthly ADD COLUMN h2i_calls BIGINT NULL DEFAULT 0 AFTER total_files_processed',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'usage_monthly'
    AND column_name = 'h2i_files'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE usage_monthly ADD COLUMN h2i_files BIGINT NULL DEFAULT 0 AFTER h2i_calls',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'usage_monthly'
    AND column_name = 'image_calls'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE usage_monthly ADD COLUMN image_calls BIGINT NULL DEFAULT 0 AFTER h2i_files',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'usage_monthly'
    AND column_name = 'image_files'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE usage_monthly ADD COLUMN image_files BIGINT NULL DEFAULT 0 AFTER image_calls',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'usage_monthly'
    AND column_name = 'pdf_calls'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE usage_monthly ADD COLUMN pdf_calls BIGINT NULL DEFAULT 0 AFTER image_files',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'usage_monthly'
    AND column_name = 'pdf_files'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE usage_monthly ADD COLUMN pdf_files BIGINT NULL DEFAULT 0 AFTER pdf_calls',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'usage_monthly'
    AND column_name = 'tools_calls'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE usage_monthly ADD COLUMN tools_calls BIGINT NULL DEFAULT 0 AFTER pdf_files',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'usage_monthly'
    AND column_name = 'tools_files'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE usage_monthly ADD COLUMN tools_files BIGINT NULL DEFAULT 0 AFTER tools_calls',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'usage_monthly'
    AND column_name = 'bytes_in'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE usage_monthly ADD COLUMN bytes_in BIGINT NULL DEFAULT 0 AFTER tools_files',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'usage_monthly'
    AND column_name = 'bytes_out'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE usage_monthly ADD COLUMN bytes_out BIGINT NULL DEFAULT 0 AFTER bytes_in',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'usage_monthly'
    AND column_name = 'errors'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE usage_monthly ADD COLUMN errors BIGINT NULL DEFAULT 0 AFTER bytes_out',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'usage_monthly'
    AND column_name = 'last_error_code'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE usage_monthly ADD COLUMN last_error_code VARCHAR(64) NULL AFTER errors',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'usage_monthly'
    AND column_name = 'last_error_message'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE usage_monthly ADD COLUMN last_error_message TEXT NULL AFTER last_error_code',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'usage_monthly'
    AND column_name = 'last_request_at'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE usage_monthly ADD COLUMN last_request_at DATETIME NULL AFTER last_error_message',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'usage_monthly'
    AND column_name = 'created_at'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE usage_monthly ADD COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER last_request_at',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'usage_monthly'
    AND column_name = 'updated_at'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE usage_monthly ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'usage_monthly'
    AND index_name = 'idx_usage_monthly_api_key_id'
);
SET @sql := IF(
  @index_exists = 0,
  'ALTER TABLE usage_monthly ADD KEY idx_usage_monthly_api_key_id (api_key_id)',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'usage_monthly'
    AND index_name = 'idx_usage_monthly_period'
);
SET @sql := IF(
  @index_exists = 0,
  'ALTER TABLE usage_monthly ADD KEY idx_usage_monthly_period (period)',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'usage_monthly'
    AND index_name = 'idx_usage_monthly_api_key_period'
);
SET @sql := IF(
  @index_exists = 0,
  'ALTER TABLE usage_monthly ADD KEY idx_usage_monthly_api_key_period (api_key_id, period)',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


SET @index_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'usage_monthly'
    AND index_name = 'idx_usage_monthly_created_at'
);
SET @sql := IF(
  @index_exists = 0,
  'ALTER TABLE usage_monthly ADD KEY idx_usage_monthly_created_at (created_at)',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'usage_monthly'
    AND column_name = 'reserved_files'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE usage_monthly ADD COLUMN reserved_files BIGINT NOT NULL DEFAULT 0 AFTER used_files',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- usage_monthly -> api_keys
SET @usage_exists := (
  SELECT COUNT(1)
  FROM information_schema.tables
  WHERE table_schema = DATABASE()
    AND table_name = 'usage_monthly'
);

SET @usage_engine := (
  SELECT ENGINE
  FROM information_schema.tables
  WHERE table_schema = DATABASE()
    AND table_name = 'usage_monthly'
);

SET @usage_fk := (
  SELECT COUNT(1)
  FROM information_schema.KEY_COLUMN_USAGE
  WHERE table_schema = DATABASE()
    AND table_name = 'usage_monthly'
    AND referenced_table_name = 'api_keys'
    AND referenced_column_name = 'id'
    AND constraint_name = 'fk_usage_monthly_api_key'
);

SET @sql := IF(
  @usage_exists > 0
    AND @usage_engine = 'InnoDB'
    AND @usage_fk = 0,
  'ALTER TABLE usage_monthly ADD CONSTRAINT fk_usage_monthly_api_key FOREIGN KEY (api_key_id) REFERENCES api_keys(id) ON DELETE CASCADE ON UPDATE CASCADE',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
