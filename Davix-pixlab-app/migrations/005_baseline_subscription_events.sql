CREATE TABLE IF NOT EXISTS subscription_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  event_id VARCHAR(190) NOT NULL,
  received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  normalized_event VARCHAR(64) NULL,
  wp_user_id BIGINT NULL,
  customer_email VARCHAR(190) NULL,
  subscription_id VARCHAR(190) NULL,
  order_id VARCHAR(190) NULL,
  plan_slug VARCHAR(190) NULL,
  valid_from DATETIME NULL,
  valid_until DATETIME NULL,
  decision VARCHAR(32) NULL,
  api_key_id BIGINT NULL,
  error_message TEXT NULL,
  payload_json JSON NULL,
  UNIQUE KEY uniq_subscription_events_event_id (event_id),
  KEY idx_subscription_events_received_at (received_at),
  KEY idx_subscription_events_decision (decision),
  KEY idx_subscription_events_customer_email (customer_email),
  KEY idx_subscription_events_subscription_id (subscription_id),
  KEY idx_subscription_events_order_id (order_id),
  KEY idx_subscription_events_wp_user_id (wp_user_id),
  KEY idx_subscription_events_api_key_id (api_key_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'subscription_events'
    AND column_name = 'event_id'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE subscription_events ADD COLUMN event_id VARCHAR(190) NOT NULL AFTER id',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'subscription_events'
    AND column_name = 'received_at'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE subscription_events ADD COLUMN received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER event_id',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'subscription_events'
    AND column_name = 'normalized_event'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE subscription_events ADD COLUMN normalized_event VARCHAR(64) NULL AFTER received_at',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'subscription_events'
    AND column_name = 'wp_user_id'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE subscription_events ADD COLUMN wp_user_id BIGINT NULL AFTER normalized_event',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'subscription_events'
    AND column_name = 'customer_email'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE subscription_events ADD COLUMN customer_email VARCHAR(190) NULL AFTER wp_user_id',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'subscription_events'
    AND column_name = 'subscription_id'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE subscription_events ADD COLUMN subscription_id VARCHAR(190) NULL AFTER customer_email',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'subscription_events'
    AND column_name = 'order_id'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE subscription_events ADD COLUMN order_id VARCHAR(190) NULL AFTER subscription_id',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'subscription_events'
    AND column_name = 'plan_slug'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE subscription_events ADD COLUMN plan_slug VARCHAR(190) NULL AFTER order_id',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'subscription_events'
    AND column_name = 'valid_from'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE subscription_events ADD COLUMN valid_from DATETIME NULL AFTER plan_slug',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'subscription_events'
    AND column_name = 'valid_until'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE subscription_events ADD COLUMN valid_until DATETIME NULL AFTER valid_from',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'subscription_events'
    AND column_name = 'decision'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE subscription_events ADD COLUMN decision VARCHAR(32) NULL AFTER valid_until',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'subscription_events'
    AND column_name = 'api_key_id'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE subscription_events ADD COLUMN api_key_id BIGINT NULL AFTER decision',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'subscription_events'
    AND column_name = 'error_message'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE subscription_events ADD COLUMN error_message TEXT NULL AFTER api_key_id',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'subscription_events'
    AND column_name = 'payload_json'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE subscription_events ADD COLUMN payload_json JSON NULL AFTER error_message',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'subscription_events'
    AND index_name = 'uniq_subscription_events_event_id'
);
SET @sql := IF(
  @index_exists = 0,
  'ALTER TABLE subscription_events ADD UNIQUE KEY uniq_subscription_events_event_id (event_id)',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'subscription_events'
    AND index_name = 'idx_subscription_events_received_at'
);
SET @sql := IF(
  @index_exists = 0,
  'ALTER TABLE subscription_events ADD KEY idx_subscription_events_received_at (received_at)',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'subscription_events'
    AND index_name = 'idx_subscription_events_decision'
);
SET @sql := IF(
  @index_exists = 0,
  'ALTER TABLE subscription_events ADD KEY idx_subscription_events_decision (decision)',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'subscription_events'
    AND index_name = 'idx_subscription_events_customer_email'
);
SET @sql := IF(
  @index_exists = 0,
  'ALTER TABLE subscription_events ADD KEY idx_subscription_events_customer_email (customer_email)',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'subscription_events'
    AND index_name = 'idx_subscription_events_subscription_id'
);
SET @sql := IF(
  @index_exists = 0,
  'ALTER TABLE subscription_events ADD KEY idx_subscription_events_subscription_id (subscription_id)',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'subscription_events'
    AND index_name = 'idx_subscription_events_order_id'
);
SET @sql := IF(
  @index_exists = 0,
  'ALTER TABLE subscription_events ADD KEY idx_subscription_events_order_id (order_id)',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'subscription_events'
    AND index_name = 'idx_subscription_events_wp_user_id'
);
SET @sql := IF(
  @index_exists = 0,
  'ALTER TABLE subscription_events ADD KEY idx_subscription_events_wp_user_id (wp_user_id)',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'subscription_events'
    AND index_name = 'idx_subscription_events_api_key_id'
);
SET @sql := IF(
  @index_exists = 0,
  'ALTER TABLE subscription_events ADD KEY idx_subscription_events_api_key_id (api_key_id)',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
