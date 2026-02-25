ALTER TABLE alert_state
  ADD COLUMN incident_id VARCHAR(64) NULL AFTER last_value,
  ADD COLUMN last_notified_at DATETIME NULL AFTER incident_id;
