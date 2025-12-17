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
