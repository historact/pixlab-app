-- Ensure identity columns exist and are indexed for upserts
ALTER TABLE api_keys
  ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(190) NULL AFTER order_id;

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
