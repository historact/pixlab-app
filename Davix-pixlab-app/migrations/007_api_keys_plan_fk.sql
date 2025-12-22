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
