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
