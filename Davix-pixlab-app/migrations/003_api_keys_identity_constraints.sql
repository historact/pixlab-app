-- Add missing identity and status columns for api_keys
ALTER TABLE api_keys
  ADD COLUMN IF NOT EXISTS subscription_id VARCHAR(190) NULL AFTER external_subscription_id,
  ADD COLUMN IF NOT EXISTS order_id VARCHAR(190) NULL AFTER subscription_id,
  ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(190) NULL AFTER order_id;

-- Backfill identifiers from legacy columns
UPDATE api_keys
  SET subscription_id = external_subscription_id
  WHERE subscription_id IS NULL AND external_subscription_id IS NOT NULL;

UPDATE api_keys
  SET order_id = wp_order_id
  WHERE order_id IS NULL AND wp_order_id IS NOT NULL;

-- Deduplicate by wp_user_id keeping the most recently updated row
WITH ranked_wp AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY wp_user_id ORDER BY updated_at DESC, id DESC) AS rn
  FROM api_keys
  WHERE wp_user_id IS NOT NULL
)
DELETE ak
FROM api_keys ak
JOIN ranked_wp r ON ak.id = r.id
WHERE r.rn > 1;

-- Deduplicate by customer_email preferring rows with wp_user_id and newest updated_at
WITH ranked_email AS (
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
WHERE r.rn > 1;

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
