CREATE TABLE IF NOT EXISTS plans (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  plan_slug VARCHAR(190) NOT NULL,
  name VARCHAR(255) NULL,
  billing_period VARCHAR(64) NULL,
  monthly_quota_files INT NULL,
  max_files_per_request INT NULL,
  max_total_upload_mb INT NULL,
  max_dimension_px INT NULL,
  timeout_seconds INT NULL,
  allow_h2i TINYINT(1) NULL DEFAULT 1,
  allow_image TINYINT(1) NULL DEFAULT 1,
  allow_pdf TINYINT(1) NULL DEFAULT 1,
  allow_tools TINYINT(1) NULL DEFAULT 1,
  is_free TINYINT(1) NULL DEFAULT 0,
  description TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_plan_slug (plan_slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'plans'
    AND column_name = 'plan_slug'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE plans ADD COLUMN plan_slug VARCHAR(190) NOT NULL AFTER id',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'plans'
    AND column_name = 'name'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE plans ADD COLUMN name VARCHAR(255) NULL AFTER plan_slug',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'plans'
    AND column_name = 'billing_period'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE plans ADD COLUMN billing_period VARCHAR(64) NULL AFTER name',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'plans'
    AND column_name = 'monthly_quota_files'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE plans ADD COLUMN monthly_quota_files INT NULL AFTER billing_period',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'plans'
    AND column_name = 'max_files_per_request'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE plans ADD COLUMN max_files_per_request INT NULL AFTER monthly_quota_files',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'plans'
    AND column_name = 'max_total_upload_mb'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE plans ADD COLUMN max_total_upload_mb INT NULL AFTER max_files_per_request',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'plans'
    AND column_name = 'max_dimension_px'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE plans ADD COLUMN max_dimension_px INT NULL AFTER max_total_upload_mb',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'plans'
    AND column_name = 'timeout_seconds'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE plans ADD COLUMN timeout_seconds INT NULL AFTER max_dimension_px',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'plans'
    AND column_name = 'allow_h2i'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE plans ADD COLUMN allow_h2i TINYINT(1) NULL DEFAULT 1 AFTER timeout_seconds',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'plans'
    AND column_name = 'allow_image'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE plans ADD COLUMN allow_image TINYINT(1) NULL DEFAULT 1 AFTER allow_h2i',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'plans'
    AND column_name = 'allow_pdf'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE plans ADD COLUMN allow_pdf TINYINT(1) NULL DEFAULT 1 AFTER allow_image',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'plans'
    AND column_name = 'allow_tools'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE plans ADD COLUMN allow_tools TINYINT(1) NULL DEFAULT 1 AFTER allow_pdf',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'plans'
    AND column_name = 'is_free'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE plans ADD COLUMN is_free TINYINT(1) NULL DEFAULT 0 AFTER allow_tools',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'plans'
    AND column_name = 'description'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE plans ADD COLUMN description TEXT NULL AFTER is_free',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'plans'
    AND column_name = 'created_at'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE plans ADD COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER description',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'plans'
    AND column_name = 'updated_at'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE plans ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'plans'
    AND index_name = 'uniq_plan_slug'
);
SET @sql := IF(
  @index_exists = 0,
  'ALTER TABLE plans ADD UNIQUE KEY uniq_plan_slug (plan_slug)',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @tbl_exists := (
  SELECT COUNT(1)
  FROM information_schema.tables
  WHERE table_schema = DATABASE()
    AND table_name = 'admin_sessions'
);

SET @idx_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'admin_sessions'
    AND index_name = 'idx_admin_sessions_expires'
);

SET @sql := IF(
  @tbl_exists = 1 AND @idx_exists = 0,
  'ALTER TABLE admin_sessions ADD INDEX idx_admin_sessions_expires (expires)',
  'DO 0'
);

PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
