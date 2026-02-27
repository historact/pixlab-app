CREATE TABLE IF NOT EXISTS internal_rate_limit_windows (
  window_start DATETIME NOT NULL,
  key_hash CHAR(64) NOT NULL,
  count INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (window_start, key_hash),
  KEY idx_internal_rate_limit_windows_updated_at (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admin_login_lockouts (
  subject_hash CHAR(64) NOT NULL,
  ip VARCHAR(64) NOT NULL,
  username VARCHAR(64) NOT NULL,
  count INT UNSIGNED NOT NULL DEFAULT 0,
  first_attempt_at DATETIME NOT NULL,
  lock_until DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (subject_hash),
  KEY idx_admin_login_lockouts_lock_until (lock_until),
  KEY idx_admin_login_lockouts_updated_at (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
