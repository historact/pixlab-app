SET @idx_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'alert_events'
    AND index_name = 'idx_alert_events_created_at'
);
SET @sql := IF(
  @idx_exists = 0,
  'ALTER TABLE alert_events ADD INDEX idx_alert_events_created_at (created_at)',
  'DO 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
