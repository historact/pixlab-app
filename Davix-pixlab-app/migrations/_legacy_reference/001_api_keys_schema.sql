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
ALTER TABLE api_keys
  ADD COLUMN IF NOT EXISTS key_prefix VARCHAR(32) NOT NULL AFTER id,
  ADD COLUMN IF NOT EXISTS key_hash VARCHAR(255) NOT NULL AFTER key_prefix,
  ADD COLUMN IF NOT EXISTS status ENUM('active','disabled') NOT NULL DEFAULT 'active' AFTER key_hash,
  ADD COLUMN IF NOT EXISTS plan_id BIGINT NULL AFTER status,
  ADD COLUMN IF NOT EXISTS customer_email VARCHAR(190) NULL AFTER plan_id,
  ADD COLUMN IF NOT EXISTS customer_name VARCHAR(190) NULL AFTER customer_email,
  ADD COLUMN IF NOT EXISTS valid_from DATETIME NULL AFTER customer_name,
  ADD COLUMN IF NOT EXISTS valid_until DATETIME NULL AFTER valid_from,
  ADD COLUMN IF NOT EXISTS metadata_json JSON NULL AFTER valid_until,
  ADD COLUMN IF NOT EXISTS created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER metadata_json,
  ADD COLUMN IF NOT EXISTS updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at,
  ADD COLUMN IF NOT EXISTS license_key VARCHAR(255) NULL COMMENT 'deprecated: do not use' AFTER updated_at,
  ADD COLUMN IF NOT EXISTS wp_order_id BIGINT NULL COMMENT 'deprecated: do not use' AFTER license_key,
  ADD COLUMN IF NOT EXISTS wp_subscription_id BIGINT NULL COMMENT 'deprecated: do not use' AFTER wp_order_id,
  ADD COLUMN IF NOT EXISTS wp_user_id BIGINT NULL COMMENT 'deprecated: do not use' AFTER wp_subscription_id,
  ADD UNIQUE KEY uniq_key_prefix (key_prefix),
  ADD KEY idx_api_keys_plan_id (plan_id),
  ADD KEY idx_api_keys_customer_email (customer_email);
