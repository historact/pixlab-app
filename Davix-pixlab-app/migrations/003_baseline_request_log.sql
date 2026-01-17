CREATE TABLE IF NOT EXISTS request_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  api_key_id BIGINT NOT NULL,
  timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  endpoint VARCHAR(32) NULL,
  action VARCHAR(64) NULL,
  status VARCHAR(32) NULL,
  ip VARCHAR(64) NULL,
  user_agent VARCHAR(255) NULL,
  bytes_in BIGINT NULL DEFAULT 0,
  bytes_out BIGINT NULL DEFAULT 0,
  files_processed INT NULL DEFAULT 0,
  error_code VARCHAR(64) NULL,
  error_message TEXT NULL,
  params_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_api_key_id (api_key_id),
  INDEX idx_timestamp (timestamp),
  INDEX idx_endpoint (endpoint)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @index_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'request_log'
    AND index_name = 'idx_api_key_id'
);
SET @sql := IF(
  @index_exists = 0,
  'ALTER TABLE request_log ADD INDEX idx_api_key_id (api_key_id)',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'request_log'
    AND index_name = 'idx_timestamp'
);
SET @sql := IF(
  @index_exists = 0,
  'ALTER TABLE request_log ADD INDEX idx_timestamp (timestamp)',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'request_log'
    AND index_name = 'idx_endpoint'
);
SET @sql := IF(
  @index_exists = 0,
  'ALTER TABLE request_log ADD INDEX idx_endpoint (endpoint)',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'request_log'
    AND column_name = 'request_id'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE request_log ADD COLUMN request_id VARCHAR(64) NULL AFTER api_key_id',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'request_log'
    AND index_name = 'uq_request_log_api_key_id_request_id'
);
SET @sql := IF(
  @index_exists = 0,
  'ALTER TABLE request_log ADD UNIQUE KEY uq_request_log_api_key_id_request_id (api_key_id, request_id)',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add foreign keys to enforce cascading deletes from api_keys

-- request_log -> api_keys
SET @request_log_exists := (
  SELECT COUNT(1)
  FROM information_schema.tables
  WHERE table_schema = DATABASE()
    AND table_name = 'request_log'
);

SET @request_log_engine := (
  SELECT ENGINE
  FROM information_schema.tables
  WHERE table_schema = DATABASE()
    AND table_name = 'request_log'
);

SET @request_log_fk := (
  SELECT COUNT(1)
  FROM information_schema.KEY_COLUMN_USAGE
  WHERE table_schema = DATABASE()
    AND table_name = 'request_log'
    AND referenced_table_name = 'api_keys'
    AND referenced_column_name = 'id'
    AND constraint_name = 'fk_request_log_api_key'
);

SET @sql := IF(
  @request_log_exists > 0
    AND @request_log_engine = 'InnoDB'
    AND @request_log_fk = 0,
  'ALTER TABLE request_log ADD CONSTRAINT fk_request_log_api_key FOREIGN KEY (api_key_id) REFERENCES api_keys(id) ON DELETE CASCADE ON UPDATE CASCADE',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
