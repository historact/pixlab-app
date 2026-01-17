-- Customer API key schema with hashed storage
CREATE TABLE IF NOT EXISTS api_keys (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  key_prefix VARCHAR(32) NOT NULL,
  key_hash VARCHAR(255) NOT NULL,
  status ENUM('active','disabled') NOT NULL DEFAULT 'active',
  plan_id BIGINT NULL,
  customer_email VARCHAR(190) NULL,
  customer_name VARCHAR(190) NULL,
  valid_from DATETIME NULL,
  valid_until DATETIME NULL,
  metadata_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  license_key VARCHAR(255) NULL COMMENT 'deprecated: legacy plaintext license keys',
  wp_order_id BIGINT NULL COMMENT 'deprecated',
  wp_subscription_id BIGINT NULL COMMENT 'deprecated',
  wp_user_id BIGINT NULL COMMENT 'deprecated',
  UNIQUE KEY uniq_key_prefix (key_prefix),
  KEY idx_api_keys_plan_id (plan_id),
  KEY idx_api_keys_customer_email (customer_email)
);

-- Align existing deployments (no runtime DDL in app code)
SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'api_keys'
    AND column_name = 'key_prefix'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE api_keys ADD COLUMN key_prefix VARCHAR(32) NOT NULL AFTER id',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'api_keys'
    AND column_name = 'key_hash'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE api_keys ADD COLUMN key_hash VARCHAR(255) NOT NULL AFTER key_prefix',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'api_keys'
    AND column_name = 'status'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE api_keys ADD COLUMN status ENUM(''active'',''disabled'') NOT NULL DEFAULT ''active'' AFTER key_hash',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'api_keys'
    AND column_name = 'plan_id'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE api_keys ADD COLUMN plan_id BIGINT NULL AFTER status',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'api_keys'
    AND column_name = 'customer_email'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE api_keys ADD COLUMN customer_email VARCHAR(190) NULL AFTER plan_id',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'api_keys'
    AND column_name = 'customer_name'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE api_keys ADD COLUMN customer_name VARCHAR(190) NULL AFTER customer_email',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'api_keys'
    AND column_name = 'valid_from'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE api_keys ADD COLUMN valid_from DATETIME NULL AFTER customer_name',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'api_keys'
    AND column_name = 'valid_until'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE api_keys ADD COLUMN valid_until DATETIME NULL AFTER valid_from',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'api_keys'
    AND column_name = 'metadata_json'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE api_keys ADD COLUMN metadata_json JSON NULL AFTER valid_until',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'api_keys'
    AND column_name = 'created_at'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE api_keys ADD COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER metadata_json',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'api_keys'
    AND column_name = 'updated_at'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE api_keys ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'api_keys'
    AND column_name = 'license_key'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE api_keys ADD COLUMN license_key VARCHAR(255) NULL COMMENT ''deprecated: do not use'' AFTER updated_at',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'api_keys'
    AND column_name = 'wp_order_id'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE api_keys ADD COLUMN wp_order_id BIGINT NULL COMMENT ''deprecated: do not use'' AFTER license_key',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'api_keys'
    AND column_name = 'wp_subscription_id'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE api_keys ADD COLUMN wp_subscription_id BIGINT NULL COMMENT ''deprecated: do not use'' AFTER wp_order_id',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'api_keys'
    AND column_name = 'wp_user_id'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE api_keys ADD COLUMN wp_user_id BIGINT NULL COMMENT ''deprecated: do not use'' AFTER wp_subscription_id',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'api_keys'
    AND index_name = 'uniq_key_prefix'
);
SET @sql := IF(
  @index_exists = 0,
  'ALTER TABLE api_keys ADD UNIQUE KEY uniq_key_prefix (key_prefix)',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'api_keys'
    AND index_name = 'idx_api_keys_plan_id'
);
SET @sql := IF(
  @index_exists = 0,
  'ALTER TABLE api_keys ADD KEY idx_api_keys_plan_id (plan_id)',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'api_keys'
    AND index_name = 'idx_api_keys_customer_email'
);
SET @sql := IF(
  @index_exists = 0,
  'ALTER TABLE api_keys ADD KEY idx_api_keys_customer_email (customer_email)',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add missing identity and status columns for api_keys
SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'api_keys'
    AND column_name = 'subscription_id'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE api_keys ADD COLUMN subscription_id VARCHAR(190) NULL AFTER customer_name',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'api_keys'
    AND column_name = 'order_id'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE api_keys ADD COLUMN order_id VARCHAR(190) NULL AFTER subscription_id',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'api_keys'
    AND column_name = 'subscription_status'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE api_keys ADD COLUMN subscription_status VARCHAR(190) NULL AFTER order_id',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE api_keys
  SET order_id = wp_order_id
  WHERE order_id IS NULL AND wp_order_id IS NOT NULL;

-- Deduplicate by wp_user_id keeping the most recently updated row
SET @has_rows := (SELECT COUNT(1) FROM api_keys);
SET @sql := IF(
  @has_rows > 0,
  'WITH ranked_wp AS (
     SELECT id, ROW_NUMBER() OVER (PARTITION BY wp_user_id ORDER BY updated_at DESC, id DESC) AS rn
     FROM api_keys
     WHERE wp_user_id IS NOT NULL
   )
   DELETE ak
   FROM api_keys ak
   JOIN ranked_wp r ON ak.id = r.id
   WHERE r.rn > 1',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Deduplicate by customer_email preferring rows with wp_user_id and newest updated_at
SET @has_rows := (SELECT COUNT(1) FROM api_keys);
SET @sql := IF(
  @has_rows > 0,
  'WITH ranked_email AS (
     SELECT id,
            ROW_NUMBER() OVER (
              PARTITION BY customer_email
              ORDER BY (wp_user_id IS NULL), updated_at DESC, id DESC
            ) AS rn
     FROM api_keys
     WHERE customer_email IS NOT NULL
   )
   DELETE ak
   FROM api_keys ak
   JOIN ranked_email r ON ak.id = r.id
   WHERE r.rn > 1',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add uniqueness on wp_user_id
SET @wp_idx := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'api_keys'
    AND index_name = 'uniq_api_keys_wp_user_id'
);
SET @sql := IF(@wp_idx = 0, 'ALTER TABLE api_keys ADD UNIQUE KEY uniq_api_keys_wp_user_id (wp_user_id)', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add uniqueness on customer_email
SET @email_idx := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'api_keys'
    AND index_name = 'uniq_api_keys_customer_email'
);
SET @sql := IF(@email_idx = 0, 'ALTER TABLE api_keys ADD UNIQUE KEY uniq_api_keys_customer_email (customer_email)', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Ensure identity columns exist and are indexed for upserts
SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'api_keys'
    AND column_name = 'subscription_status'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE api_keys ADD COLUMN subscription_status VARCHAR(190) NULL AFTER order_id',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add supporting indexes when missing
SET @sub_idx := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'api_keys'
    AND index_name = 'idx_api_keys_subscription_id'
);
SET @sql := IF(@sub_idx = 0, 'ALTER TABLE api_keys ADD INDEX idx_api_keys_subscription_id (subscription_id)', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @wp_idx := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'api_keys'
    AND index_name = 'uniq_api_keys_wp_user_id'
);
SET @sql := IF(@wp_idx = 0, 'ALTER TABLE api_keys ADD UNIQUE KEY uniq_api_keys_wp_user_id (wp_user_id)', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @email_idx := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'api_keys'
    AND index_name = 'uniq_api_keys_customer_email'
);
SET @sql := IF(@email_idx = 0, 'ALTER TABLE api_keys ADD UNIQUE KEY uniq_api_keys_customer_email (customer_email)', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add supporting index for expiry watcher queries
SET @expiry_idx := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'api_keys'
    AND index_name = 'idx_api_keys_status_valid_until_id'
);
SET @sql := IF(
  @expiry_idx = 0,
  'CREATE INDEX idx_api_keys_status_valid_until_id ON api_keys(status, valid_until, id)',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Ensure api_keys.plan_id is nullable and the foreign key uses ON DELETE SET NULL
ALTER TABLE api_keys
  MODIFY COLUMN plan_id BIGINT NULL;

-- Drop existing plan foreign key if present (handles differing constraint names)
SET @fk_name := (
  SELECT constraint_name
  FROM information_schema.key_column_usage
  WHERE table_schema = DATABASE()
    AND table_name = 'api_keys'
    AND column_name = 'plan_id'
    AND referenced_table_name = 'plans'
    AND referenced_column_name = 'id'
  LIMIT 1
);

SET @sql := IF(
  @fk_name IS NOT NULL,
  CONCAT('ALTER TABLE api_keys DROP FOREIGN KEY ', @fk_name),
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Recreate the foreign key with ON UPDATE CASCADE, ON DELETE SET NULL
SET @fk_exists := (
  SELECT COUNT(1)
  FROM information_schema.key_column_usage
  WHERE table_schema = DATABASE()
    AND table_name = 'api_keys'
    AND column_name = 'plan_id'
    AND referenced_table_name = 'plans'
    AND referenced_column_name = 'id'
);

SET @sql := IF(
  @fk_exists = 0,
  'ALTER TABLE api_keys ADD CONSTRAINT fk_api_keys_plan FOREIGN KEY (plan_id) REFERENCES plans(id) ON UPDATE CASCADE ON DELETE SET NULL',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Make api_keys.plan_id safely nullable and ensure FK uses ON DELETE SET NULL / ON UPDATE CASCADE

-- Ensure plan_id allows NULL (idempotent)
ALTER TABLE api_keys
  MODIFY COLUMN plan_id BIGINT NULL;

-- Detect existing FK referencing plans
SET @fk_name := (
  SELECT constraint_name
  FROM information_schema.referential_constraints
  WHERE constraint_schema = DATABASE()
    AND table_name = 'api_keys'
    AND referenced_table_name = 'plans'
  LIMIT 1
);

-- Detect current delete/update rules
SET @delete_rule := (
  SELECT delete_rule
  FROM information_schema.referential_constraints
  WHERE constraint_schema = DATABASE()
    AND table_name = 'api_keys'
    AND referenced_table_name = 'plans'
  LIMIT 1
);

SET @update_rule := (
  SELECT update_rule
  FROM information_schema.referential_constraints
  WHERE constraint_schema = DATABASE()
    AND table_name = 'api_keys'
    AND referenced_table_name = 'plans'
  LIMIT 1
);

-- Drop FK when it exists but does not match desired rules
SET @drop_sql := IF(
  @fk_name IS NOT NULL AND (@delete_rule <> 'SET NULL' OR @update_rule <> 'CASCADE'),
  CONCAT('ALTER TABLE api_keys DROP FOREIGN KEY ', @fk_name),
  'DO 0'
);
PREPARE stmt FROM @drop_sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Re-evaluate FK presence after drop
SET @fk_exists := (
  SELECT COUNT(1)
  FROM information_schema.referential_constraints
  WHERE constraint_schema = DATABASE()
    AND table_name = 'api_keys'
    AND referenced_table_name = 'plans'
);

-- Add FK when missing
SET @add_sql := IF(
  @fk_exists = 0,
  'ALTER TABLE api_keys ADD CONSTRAINT fk_api_keys_plan FOREIGN KEY (plan_id) REFERENCES plans(id) ON UPDATE CASCADE ON DELETE SET NULL',
  'DO 0'
);
PREPARE stmt FROM @add_sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'api_keys'
    AND column_name = 'key_last4'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE api_keys ADD COLUMN key_last4 VARCHAR(4) NULL AFTER key_prefix',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'api_keys'
    AND column_name = 'rotated_at'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE api_keys ADD COLUMN rotated_at DATETIME NULL AFTER key_last4',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
