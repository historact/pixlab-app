CREATE TABLE IF NOT EXISTS alert_deliveries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  rule_id INT UNSIGNED NULL,
  incident_id VARCHAR(128) NOT NULL,
  event_type VARCHAR(16) NOT NULL,
  channel VARCHAR(16) NOT NULL,
  ok TINYINT(1) NOT NULL,
  attempts INT UNSIGNED NOT NULL DEFAULT 1,
  duration_ms INT UNSIGNED NULL,
  throttled TINYINT(1) NOT NULL DEFAULT 0,
  error_code VARCHAR(64) NULL,
  error_message TEXT NULL,
  provider_message_id VARCHAR(128) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_alert_deliveries_rule_incident_event_channel_created (rule_id, incident_id, event_type, channel, created_at),
  INDEX idx_alert_deliveries_created_at (created_at)
);
