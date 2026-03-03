-- Canonical schema baseline derived from db/davix_pixlab.sql
-- Migration-safe: no DROP/CREATE DATABASE/USE, no data inserts.
-- schema_migrations is intentionally excluded and managed by db.js bootstrap.

CREATE TABLE `admin_login_lockouts` (
  `subject_hash` char(64) NOT NULL,
  `ip` varchar(64) NOT NULL,
  `username` varchar(64) NOT NULL,
  `count` int(10) UNSIGNED NOT NULL DEFAULT 0,
  `first_attempt_at` datetime NOT NULL,
  `lock_until` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `admin_sessions` (
  `session_id` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `expires` int(11) UNSIGNED NOT NULL,
  `data` mediumtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

CREATE TABLE `alert_deliveries` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `rule_id` int(10) UNSIGNED DEFAULT NULL,
  `incident_id` varchar(128) NOT NULL,
  `event_type` varchar(16) NOT NULL,
  `channel` varchar(16) NOT NULL,
  `ok` tinyint(1) NOT NULL,
  `attempts` int(10) UNSIGNED NOT NULL DEFAULT 1,
  `duration_ms` int(10) UNSIGNED DEFAULT NULL,
  `throttled` tinyint(1) NOT NULL DEFAULT 0,
  `error_code` varchar(64) DEFAULT NULL,
  `error_message` text DEFAULT NULL,
  `provider_message_id` varchar(128) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

CREATE TABLE `alert_events` (
  `id` int(10) UNSIGNED NOT NULL,
  `rule_id` int(10) UNSIGNED NOT NULL,
  `state` varchar(16) NOT NULL,
  `value` double DEFAULT NULL,
  `message` text DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

CREATE TABLE `alert_rules` (
  `id` int(10) UNSIGNED NOT NULL,
  `name` varchar(255) NOT NULL,
  `enabled` tinyint(1) NOT NULL DEFAULT 1,
  `metric_key` varchar(64) NOT NULL,
  `scope_json` text DEFAULT NULL,
  `operator` varchar(8) NOT NULL DEFAULT '>',
  `threshold` double NOT NULL DEFAULT 0,
  `for_sec` int(10) UNSIGNED NOT NULL DEFAULT 0,
  `eval_interval_sec` int(10) UNSIGNED NOT NULL DEFAULT 10,
  `cooldown_sec` int(10) UNSIGNED NOT NULL DEFAULT 0,
  `severity` varchar(16) NOT NULL DEFAULT 'warn',
  `channels_json` text DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

CREATE TABLE `alert_state` (
  `rule_id` int(10) UNSIGNED NOT NULL,
  `state` varchar(16) NOT NULL DEFAULT 'OK',
  `last_change_at` datetime NOT NULL DEFAULT current_timestamp(),
  `last_fire_at` datetime DEFAULT NULL,
  `last_eval_at` datetime DEFAULT NULL,
  `pending_since` datetime DEFAULT NULL,
  `ack_until` datetime DEFAULT NULL,
  `silence_until` datetime DEFAULT NULL,
  `last_snapshot_path` text DEFAULT NULL,
  `last_message` text DEFAULT NULL,
  `last_value` double DEFAULT NULL,
  `incident_id` varchar(64) DEFAULT NULL,
  `last_notified_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

CREATE TABLE `api_keys` (
  `id` int(10) UNSIGNED NOT NULL,
  `license_key` varchar(255) DEFAULT NULL,
  `wp_order_id` bigint(20) DEFAULT NULL COMMENT 'deprecated: do not use',
  `wp_subscription_id` bigint(20) DEFAULT NULL COMMENT 'deprecated: do not use',
  `key_prefix` varchar(32) DEFAULT NULL,
  `key_hash` varchar(255) DEFAULT NULL,
  `key_last4` varchar(4) DEFAULT NULL,
  `rotated_at` datetime DEFAULT NULL,
  `revoked_at` datetime DEFAULT NULL,
  `plan_id` int(10) UNSIGNED NOT NULL,
  `wp_license_id` bigint(20) UNSIGNED DEFAULT NULL,
  `wp_user_id` bigint(20) UNSIGNED DEFAULT NULL,
  `wp_product_id` bigint(20) UNSIGNED DEFAULT NULL,
  `subscription_id` varchar(191) DEFAULT NULL,
  `order_id` bigint(20) UNSIGNED DEFAULT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'active',
  `subscription_status` varchar(20) DEFAULT NULL,
  `valid_from` datetime DEFAULT NULL,
  `valid_until` datetime DEFAULT NULL,
  `metadata_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`metadata_json`)),
  `current_period_start` datetime DEFAULT NULL,
  `current_period_end` datetime DEFAULT NULL,
  `last_sync_at` datetime DEFAULT NULL,
  `customer_email` varchar(191) DEFAULT NULL,
  `customer_name` varchar(191) DEFAULT NULL,
  `times_activated` int(10) UNSIGNED DEFAULT 0,
  `times_activated_max` int(10) UNSIGNED DEFAULT 0,
  `last_seen_ip` varchar(45) DEFAULT NULL,
  `last_seen_user_agent` varchar(255) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `burst_limits_window` (
  `window_start` datetime NOT NULL,
  `api_key_id` bigint(20) UNSIGNED NOT NULL,
  `scope` varchar(32) NOT NULL,
  `count` int(10) UNSIGNED NOT NULL DEFAULT 0,
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

CREATE TABLE `internal_rate_limit_windows` (
  `window_start` datetime NOT NULL,
  `key_hash` char(64) NOT NULL,
  `count` int(10) UNSIGNED NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `lease_locks` (
  `name` varchar(64) NOT NULL,
  `owner_id` varchar(128) NOT NULL,
  `lease_until` datetime NOT NULL,
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

CREATE TABLE `plans` (
  `id` int(10) UNSIGNED NOT NULL,
  `plan_slug` varchar(50) NOT NULL,
  `name` varchar(100) NOT NULL,
  `billing_period` varchar(20) NOT NULL DEFAULT 'monthly',
  `monthly_quota_files` int(10) UNSIGNED NOT NULL,
  `max_files_per_request` int(10) UNSIGNED DEFAULT 10,
  `max_total_upload_mb` int(10) UNSIGNED DEFAULT 10,
  `max_dimension_px` int(10) UNSIGNED DEFAULT 6000,
  `timeout_seconds` int(10) UNSIGNED DEFAULT 30,
  `allow_h2i` tinyint(1) NOT NULL DEFAULT 1,
  `allow_image` tinyint(1) NOT NULL DEFAULT 1,
  `allow_pdf` tinyint(1) NOT NULL DEFAULT 1,
  `allow_tools` tinyint(1) NOT NULL DEFAULT 1,
  `timeout_ms` int(10) UNSIGNED DEFAULT NULL,
  `max_upload_bytes_per_file` int(10) UNSIGNED DEFAULT NULL,
  `h2i_enabled` tinyint(1) DEFAULT NULL,
  `h2i_max_html_chars` int(10) UNSIGNED DEFAULT NULL,
  `h2i_max_render_width` int(10) UNSIGNED DEFAULT NULL,
  `h2i_max_render_height` int(10) UNSIGNED DEFAULT NULL,
  `h2i_max_render_pixels` int(10) UNSIGNED DEFAULT NULL,
  `image_enabled` tinyint(1) DEFAULT NULL,
  `image_max_dimension_px` int(10) UNSIGNED DEFAULT NULL,
  `image_max_total_upload_mb` int(10) UNSIGNED DEFAULT NULL,
  `image_max_files_per_request` int(10) UNSIGNED DEFAULT NULL,
  `pdf_enabled` tinyint(1) DEFAULT NULL,
  `pdf_max_total_upload_mb` int(10) UNSIGNED DEFAULT NULL,
  `pdf_max_files_per_request` int(10) UNSIGNED DEFAULT NULL,
  `pdf_max_pages_to_images` int(10) UNSIGNED DEFAULT NULL,
  `pdf_max_pages_extract_images` int(10) UNSIGNED DEFAULT NULL,
  `pdf_max_pages_split` int(10) UNSIGNED DEFAULT NULL,
  `tools_enabled` tinyint(1) DEFAULT NULL,
  `tools_max_dimension_px` int(10) UNSIGNED DEFAULT NULL,
  `tools_max_total_upload_mb` int(10) UNSIGNED DEFAULT NULL,
  `tools_max_files_per_request` int(10) UNSIGNED DEFAULT NULL,
  `quota_mode` enum('monthly_total_only','monthly_scoped_only','monthly_both') DEFAULT NULL,
  `monthly_total_limit` int(10) UNSIGNED DEFAULT NULL,
  `monthly_h2i_limit` int(10) UNSIGNED DEFAULT NULL,
  `monthly_image_limit` int(10) UNSIGNED DEFAULT NULL,
  `monthly_pdf_limit` int(10) UNSIGNED DEFAULT NULL,
  `monthly_tools_limit` int(10) UNSIGNED DEFAULT NULL,
  `burst_limit_per_min` int(10) UNSIGNED DEFAULT NULL,
  `burst_window_seconds` int(10) UNSIGNED DEFAULT 60,
  `burst_applies_to` varchar(16) DEFAULT 'h2i',
  `is_free` tinyint(1) NOT NULL DEFAULT 0,
  `description` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `quota_ledger` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `api_key_id` bigint(20) UNSIGNED NOT NULL,
  `period` varchar(32) NOT NULL,
  `dedupe_id` varchar(128) NOT NULL,
  `endpoint` varchar(32) DEFAULT NULL,
  `action` varchar(64) DEFAULT NULL,
  `reserve_units` bigint(20) NOT NULL DEFAULT 0,
  `finalized_units` bigint(20) NOT NULL DEFAULT 0,
  `status` varchar(32) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `expires_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `rate_limits_daily` (
  `day_utc` date NOT NULL,
  `scope` varchar(32) NOT NULL,
  `ip` varbinary(16) NOT NULL,
  `count` int(10) UNSIGNED NOT NULL DEFAULT 0,
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

CREATE TABLE `request_log` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `api_key_id` int(10) UNSIGNED NOT NULL,
  `timestamp` datetime NOT NULL,
  `endpoint` enum('h2i','image','pdf','tools') NOT NULL,
  `action` varchar(50) DEFAULT NULL,
  `files_processed` int(10) UNSIGNED NOT NULL DEFAULT 0,
  `status` enum('success','error') NOT NULL,
  `ip` varchar(45) DEFAULT NULL,
  `user_agent` varchar(255) DEFAULT NULL,
  `bytes_in` bigint(20) UNSIGNED NOT NULL DEFAULT 0,
  `bytes_out` bigint(20) UNSIGNED NOT NULL DEFAULT 0,
  `error_code` varchar(50) DEFAULT NULL,
  `error_message` varchar(255) DEFAULT NULL,
  `params_json` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `request_id` varchar(128) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `subscription_events` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `event_id` varchar(190) NOT NULL,
  `received_at` datetime NOT NULL DEFAULT current_timestamp(),
  `normalized_event` varchar(64) DEFAULT NULL,
  `wp_user_id` bigint(20) DEFAULT NULL,
  `customer_email` varchar(190) DEFAULT NULL,
  `subscription_id` varchar(190) DEFAULT NULL,
  `order_id` varchar(190) DEFAULT NULL,
  `plan_slug` varchar(190) DEFAULT NULL,
  `valid_from` datetime DEFAULT NULL,
  `valid_until` datetime DEFAULT NULL,
  `decision` varchar(32) DEFAULT NULL,
  `api_key_id` bigint(20) DEFAULT NULL,
  `error_message` text DEFAULT NULL,
  `payload_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`payload_json`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `usage_monthly` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `api_key_id` int(10) UNSIGNED NOT NULL,
  `period` varchar(128) NOT NULL,
  `used_files` int(10) UNSIGNED NOT NULL DEFAULT 0,
  `reserved_files` bigint(20) NOT NULL DEFAULT 0,
  `used_bytes` bigint(20) UNSIGNED NOT NULL DEFAULT 0,
  `total_calls` int(10) UNSIGNED NOT NULL DEFAULT 0,
  `total_files_processed` int(10) UNSIGNED NOT NULL DEFAULT 0,
  `h2i_calls` int(10) UNSIGNED NOT NULL DEFAULT 0,
  `h2i_files` int(10) UNSIGNED NOT NULL DEFAULT 0,
  `image_calls` int(10) UNSIGNED NOT NULL DEFAULT 0,
  `image_files` int(10) UNSIGNED NOT NULL DEFAULT 0,
  `pdf_calls` int(10) UNSIGNED NOT NULL DEFAULT 0,
  `pdf_files` int(10) UNSIGNED NOT NULL DEFAULT 0,
  `tools_calls` int(10) UNSIGNED NOT NULL DEFAULT 0,
  `tools_files` int(10) UNSIGNED NOT NULL DEFAULT 0,
  `bytes_in` bigint(20) UNSIGNED NOT NULL DEFAULT 0,
  `bytes_out` bigint(20) UNSIGNED NOT NULL DEFAULT 0,
  `errors` int(10) UNSIGNED NOT NULL DEFAULT 0,
  `last_error_code` varchar(50) DEFAULT NULL,
  `last_error_message` varchar(255) DEFAULT NULL,
  `last_request_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

ALTER TABLE `admin_login_lockouts`
  ADD PRIMARY KEY (`subject_hash`),
  ADD KEY `idx_admin_login_lockouts_lock_until` (`lock_until`),
  ADD KEY `idx_admin_login_lockouts_updated_at` (`updated_at`);

ALTER TABLE `admin_sessions`
  ADD PRIMARY KEY (`session_id`),
  ADD KEY `idx_admin_sessions_expires` (`expires`);

ALTER TABLE `alert_deliveries`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_alert_deliveries_rule_incident_event_channel_created` (`rule_id`,`incident_id`,`event_type`,`channel`,`created_at`),
  ADD KEY `idx_alert_deliveries_created_at` (`created_at`);

ALTER TABLE `alert_events`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_alert_events_rule` (`rule_id`),
  ADD KEY `idx_alert_events_created_at` (`created_at`);

ALTER TABLE `alert_rules`
  ADD PRIMARY KEY (`id`);

ALTER TABLE `alert_state`
  ADD PRIMARY KEY (`rule_id`);

ALTER TABLE `api_keys`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `license_key` (`license_key`),
  ADD UNIQUE KEY `uq_api_keys_subscription_id` (`subscription_id`),
  ADD UNIQUE KEY `uniq_key_prefix` (`key_prefix`),
  ADD UNIQUE KEY `uniq_api_keys_wp_user_id` (`wp_user_id`),
  ADD UNIQUE KEY `uniq_api_keys_customer_email` (`customer_email`),
  ADD KEY `idx_api_keys_key_prefix` (`key_prefix`),
  ADD KEY `idx_api_keys_customer_email` (`customer_email`),
  ADD KEY `idx_api_keys_plan_id` (`plan_id`),
  ADD KEY `idx_api_keys_subscription_id` (`subscription_id`),
  ADD KEY `idx_api_keys_status_valid_until_id` (`status`,`valid_until`,`id`);

ALTER TABLE `burst_limits_window`
  ADD PRIMARY KEY (`window_start`,`api_key_id`,`scope`),
  ADD KEY `idx_burst_limits_updated_at` (`updated_at`);

ALTER TABLE `internal_rate_limit_windows`
  ADD PRIMARY KEY (`window_start`,`key_hash`),
  ADD KEY `idx_internal_rate_limit_windows_updated_at` (`updated_at`);

ALTER TABLE `lease_locks`
  ADD PRIMARY KEY (`name`);

ALTER TABLE `plans`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `plan_slug` (`plan_slug`),
  ADD UNIQUE KEY `uniq_plan_slug` (`plan_slug`);

ALTER TABLE `quota_ledger`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_quota_ledger_api_key_dedupe` (`api_key_id`,`dedupe_id`),
  ADD KEY `idx_quota_ledger_status_expires` (`status`,`expires_at`),
  ADD KEY `idx_quota_ledger_api_key_id` (`api_key_id`),
  ADD KEY `idx_quota_ledger_created_at` (`created_at`);

ALTER TABLE `rate_limits_daily`
  ADD PRIMARY KEY (`day_utc`,`scope`,`ip`),
  ADD KEY `idx_rate_limits_daily_updated_at` (`updated_at`);

ALTER TABLE `request_log`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_request_log_api_key_id_request_id` (`api_key_id`,`request_id`),
  ADD KEY `idx_request_log_api_key_time` (`api_key_id`,`timestamp`),
  ADD KEY `idx_request_log_endpoint_time` (`endpoint`,`timestamp`),
  ADD KEY `idx_request_log_created_at` (`created_at`);

ALTER TABLE `subscription_events`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_subscription_events_event_id` (`event_id`),
  ADD KEY `idx_subscription_events_received_at` (`received_at`),
  ADD KEY `idx_subscription_events_decision` (`decision`),
  ADD KEY `idx_subscription_events_customer_email` (`customer_email`),
  ADD KEY `idx_subscription_events_subscription_id` (`subscription_id`),
  ADD KEY `idx_subscription_events_order_id` (`order_id`),
  ADD KEY `idx_subscription_events_wp_user_id` (`wp_user_id`),
  ADD KEY `idx_subscription_events_api_key_id` (`api_key_id`);

ALTER TABLE `usage_monthly`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_usage_monthly_key_period` (`api_key_id`,`period`),
  ADD KEY `idx_usage_monthly_period` (`period`),
  ADD KEY `idx_usage_monthly_api_key` (`api_key_id`),
  ADD KEY `idx_usage_monthly_created_at` (`created_at`);

ALTER TABLE `alert_deliveries`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

ALTER TABLE `alert_events`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

ALTER TABLE `alert_rules`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

ALTER TABLE `api_keys`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

ALTER TABLE `plans`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

ALTER TABLE `quota_ledger`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

ALTER TABLE `request_log`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

ALTER TABLE `subscription_events`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

ALTER TABLE `usage_monthly`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

ALTER TABLE `alert_events`
  ADD CONSTRAINT `fk_alert_events_rule` FOREIGN KEY (`rule_id`) REFERENCES `alert_rules` (`id`) ON DELETE CASCADE;

ALTER TABLE `alert_state`
  ADD CONSTRAINT `fk_alert_state_rule` FOREIGN KEY (`rule_id`) REFERENCES `alert_rules` (`id`) ON DELETE CASCADE;

ALTER TABLE `api_keys`
  ADD CONSTRAINT `fk_api_keys_plan` FOREIGN KEY (`plan_id`) REFERENCES `plans` (`id`) ON UPDATE CASCADE;

ALTER TABLE `request_log`
  ADD CONSTRAINT `fk_request_log_api_key` FOREIGN KEY (`api_key_id`) REFERENCES `api_keys` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `usage_monthly`
  ADD CONSTRAINT `fk_usage_monthly_api_key` FOREIGN KEY (`api_key_id`) REFERENCES `api_keys` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
