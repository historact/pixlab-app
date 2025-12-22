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
