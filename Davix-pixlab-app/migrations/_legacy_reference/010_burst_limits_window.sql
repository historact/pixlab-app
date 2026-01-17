CREATE TABLE IF NOT EXISTS burst_limits_window (
  window_start DATETIME NOT NULL,
  api_key_id BIGINT UNSIGNED NOT NULL,
  scope VARCHAR(32) NOT NULL,
  count INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (window_start, api_key_id, scope),
  KEY idx_burst_limits_updated_at (updated_at)
);
