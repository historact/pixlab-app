CREATE TABLE IF NOT EXISTS rate_limits_daily (
  day_utc DATE NOT NULL,
  scope VARCHAR(32) NOT NULL,
  ip VARBINARY(16) NOT NULL,
  count INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (day_utc, scope, ip),
  KEY idx_rate_limits_daily_updated_at (updated_at)
);
