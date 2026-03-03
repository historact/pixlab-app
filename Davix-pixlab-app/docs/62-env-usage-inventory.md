# ENV Usage Inventory (runtime + scripts)

| ENV_NAME | occurrences | tier | status |
|---|---|---|---|
| `ADMIN_AUDIT_LOG_ENABLED` | utils/logger.js:131; utils/logger.js:232 | INTERNAL/OTHER | used |
| `ADMIN_LOGIN_LOCKOUTS_CLEANUP_BATCH_SIZE` | utils/retentionCleanup.js:66 | INTERNAL/OTHER | used |
| `ADMIN_LOGIN_LOCKOUTS_CLEANUP_INITIAL_DELAY_MS` | utils/retentionCleanup.js:65 | INTERNAL/OTHER | used |
| `ADMIN_LOGIN_LOCKOUTS_CLEANUP_INTERVAL_MS` | utils/retentionCleanup.js:64 | INTERNAL/OTHER | used |
| `ADMIN_LOGIN_LOCKOUTS_RETENTION_DAYS` | utils/retentionCleanup.js:63 | INTERNAL/OTHER | used |
| `ADMIN_LOGIN_LOCK_MINUTES` | utils/adminAuth.js:29 | INTERNAL/OTHER | used |
| `ADMIN_LOGIN_MAX_ATTEMPTS` | utils/adminAuth.js:28 | INTERNAL/OTHER | used |
| `ADMIN_LOGIN_WINDOW_MINUTES` | utils/adminAuth.js:27 | INTERNAL/OTHER | used |
| `ADMIN_PASS` | scripts/verify-production.js:53; server.js:117 | INTERNAL/OTHER | used |
| `ADMIN_PASSWORD_HASH` | utils/adminAuth.js:172; utils/validateEnv.js:86 | INTERNAL/OTHER | used |
| `ADMIN_PATH` | server.js:116 | INTERNAL/OTHER | used |
| `ADMIN_SESSIONS_CLEANUP_BATCH_SIZE` | server.js:1002 | INTERNAL/OTHER | used |
| `ADMIN_SESSIONS_CLEANUP_INTERVAL_MS` | server.js:1000 | INTERNAL/OTHER | used |
| `ADMIN_SESSIONS_RETENTION_DAYS` | server.js:1001 | INTERNAL/OTHER | used |
| `ADMIN_SESSIONS_RETENTION_ENABLED` | server.js:999 | INTERNAL/OTHER | used |
| `ADMIN_SESSION_SECRET` | server.js:502 | INTERNAL/OTHER | used |
| `ADMIN_TOTP_SECRET` | utils/adminAuth.js:181 | INTERNAL/OTHER | used |
| `ALERT_DELIVERIES_RETENTION_BATCH_SIZE` | server.js:103; utils/alertRetentionCleanup.js:13 | INTERNAL/OTHER | used |
| `ALERT_DELIVERIES_RETENTION_DAYS` | server.js:98; utils/alertRetentionCleanup.js:8 | INTERNAL/OTHER | used |
| `ALERT_DELIVERIES_RETENTION_ENABLED` | server.js:97; utils/alertRetentionCleanup.js:7 | INTERNAL/OTHER | used |
| `ALERT_DELIVERIES_RETENTION_INITIAL_DELAY_MS` | server.js:102; utils/alertRetentionCleanup.js:12 | INTERNAL/OTHER | used |
| `ALERT_DELIVERIES_RETENTION_INTERVAL_MS` | server.js:100; utils/alertRetentionCleanup.js:10 | INTERNAL/OTHER | used |
| `ALERT_EMAIL_FROM` | utils/alerts.js:254 | INTERNAL/OTHER | used |
| `ALERT_EMAIL_HOST` | utils/alerts.js:231 | INTERNAL/OTHER | used |
| `ALERT_EMAIL_JSON_TRANSPORT` | scripts/test-alert-notification-pipeline.js:42; utils/alerts.js:232 | INTERNAL/OTHER | used |
| `ALERT_EMAIL_PASS` | utils/alerts.js:239 | INTERNAL/OTHER | used |
| `ALERT_EMAIL_PORT` | utils/alerts.js:236 | INTERNAL/OTHER | used |
| `ALERT_EMAIL_SECURE` | utils/alerts.js:237 | INTERNAL/OTHER | used |
| `ALERT_EMAIL_USER` | utils/alerts.js:238 | INTERNAL/OTHER | used |
| `ALERT_EVENTS_RETENTION_BATCH_SIZE` | server.js:108; utils/alertRetentionCleanup.js:20 | INTERNAL/OTHER | used |
| `ALERT_EVENTS_RETENTION_DAYS` | server.js:105; utils/alertRetentionCleanup.js:16 | INTERNAL/OTHER | used |
| `ALERT_EVENTS_RETENTION_ENABLED` | server.js:104; utils/alertRetentionCleanup.js:15 | INTERNAL/OTHER | used |
| `ALERT_EVENTS_RETENTION_INITIAL_DELAY_MS` | server.js:107; utils/alertRetentionCleanup.js:19 | INTERNAL/OTHER | used |
| `ALERT_EVENTS_RETENTION_INTERVAL_MS` | server.js:106; utils/alertRetentionCleanup.js:17 | INTERNAL/OTHER | used |
| `ALERT_TELEGRAM_API_BASE_URL` | scripts/test-alert-notification-pipeline.js:41; utils/alerts.js:338 | INTERNAL/OTHER | used |
| `ALERT_TELEGRAM_BOT_TOKEN` | scripts/test-alert-notification-pipeline.js:40; utils/alerts.js:357; utils/alerts.js:467 | INTERNAL/OTHER | used |
| `API_KEYS` | server.js:775 | OWNER | used |
| `API_KEYS_EXPIRY_WATCHER_BATCH_SIZE` | server.js:94 | INTERNAL/OTHER | used |
| `API_KEYS_EXPIRY_WATCHER_ENABLED` | server.js:92 | INTERNAL/OTHER | used |
| `API_KEYS_EXPIRY_WATCHER_INTERVAL_MS` | server.js:93 | INTERNAL/OTHER | used |
| `AUTO_RUN_MIGRATIONS` | utils/config.js:98 | INTERNAL/OTHER | used |
| `BODY_PARSER_JSON_LIMIT` | utils/limits.js:100 | INTERNAL/OTHER | used |
| `BURST_LIMITS_WINDOW_CLEANUP_BATCH_SIZE` | utils/retentionCleanup.js:52 | INTERNAL/OTHER | used |
| `BURST_LIMITS_WINDOW_CLEANUP_INITIAL_DELAY_MS` | utils/retentionCleanup.js:51 | INTERNAL/OTHER | used |
| `BURST_LIMITS_WINDOW_CLEANUP_INTERVAL_MS` | utils/retentionCleanup.js:50 | INTERNAL/OTHER | used |
| `BURST_LIMITS_WINDOW_RETENTION_DAYS` | utils/config.js:166 | INTERNAL/OTHER | used |
| `BURST_LIMITS_WINDOW_RETENTION_ENABLED` | utils/config.js:161 | INTERNAL/OTHER | used |
| `CORS_ORIGINS` | server.js:461 | INTERNAL/OTHER | used |
| `DAVIX_DEBUG_INTERNAL` | admin/adminRoutes.js:2444; admin/adminRoutes.js:2481; admin/adminRoutes.js:3060; routes/h2i-route.js:67; routes/subscription-route.js:39; utils/customerKeys.js:13 | INTERNAL/OTHER | used |
| `DB_HOST` | db.js:241; db.js:8; scripts/verify-schema.js:36; server.js:511 | INTERNAL/OTHER | used |
| `DB_NAME` | db.js:11; db.js:244; scripts/verify-schema.js:36; server.js:514 | INTERNAL/OTHER | used |
| `DB_ORPHAN_CLEANUP_ENABLED` | server.js:95; utils/orphanCleanup.js:10 | INTERNAL/OTHER | used |
| `DB_PASS` | db.js:10; db.js:243; server.js:513 | INTERNAL/OTHER | used |
| `DB_RETENTION_CLEANUP_ENABLED` | server.js:96; utils/retentionCleanup.js:18 | INTERNAL/OTHER | used |
| `DB_RETENTION_LOG_PATH` | utils/retentionCleanup.js:19 | INTERNAL/OTHER | used |
| `DB_USER` | db.js:242; db.js:9; scripts/verify-schema.js:36; server.js:512 | INTERNAL/OTHER | used |
| `ENABLE_DIAGNOSTICS` | utils/config.js:131 | INTERNAL/OTHER | used |
| `GLOBAL_MAX_FILES_PER_REQ` | utils/config.js:76 | GLOBAL | used |
| `GLOBAL_MAX_TOTAL_UPLOAD_MB` | utils/config.js:75 | GLOBAL | used |
| `H2I_ALLOW_FILE_SCHEME` | utils/config.js:64 | INTERNAL/OTHER | used |
| `H2I_BLOCK_PRIVATE_NETWORK` | utils/config.js:141; utils/config.js:63 | INTERNAL/OTHER | used |
| `H2I_CONCURRENCY` | utils/config.js:109 | INTERNAL/OTHER | used |
| `H2I_CONCURRENCY_WAIT_MS` | utils/config.js:110 | INTERNAL/OTHER | used |
| `H2I_DNS_REBINDING_MODE` | utils/config.js:139 | INTERNAL/OTHER | used |
| `H2I_OUTPUT_CLEANUP_INTERVAL_MS` | server.js:910 | INTERNAL/OTHER | used |
| `H2I_OUTPUT_RETENTION_HOURS` | server.js:910 | INTERNAL/OTHER | used |
| `IMAGE_CONCURRENCY` | utils/config.js:117 | INTERNAL/OTHER | used |
| `IMAGE_CONCURRENCY_WAIT_MS` | utils/config.js:118 | INTERNAL/OTHER | used |
| `IMAGE_OUTPUT_CLEANUP_INTERVAL_MS` | server.js:911 | INTERNAL/OTHER | used |
| `IMAGE_OUTPUT_RETENTION_HOURS` | server.js:911 | INTERNAL/OTHER | used |
| `INTERNAL_ALLOWED_IPS` | scripts/verify-production.js:51; utils/internalAuth.js:17; utils/internalAuth.js:97; utils/validateEnv.js:98 | INTERNAL/OTHER | used |
| `INTERNAL_BASE_URL` | utils/monitoringSnapshot.js:41 | INTERNAL/OTHER | used |
| `INTERNAL_RATE_LIMIT_PER_MIN` | utils/internalAuth.js:226 | INTERNAL/OTHER | used |
| `INTERNAL_RATE_LIMIT_WINDOWS_CLEANUP_BATCH_SIZE` | utils/retentionCleanup.js:59 | INTERNAL/OTHER | used |
| `INTERNAL_RATE_LIMIT_WINDOWS_CLEANUP_INITIAL_DELAY_MS` | utils/retentionCleanup.js:58 | INTERNAL/OTHER | used |
| `INTERNAL_RATE_LIMIT_WINDOWS_CLEANUP_INTERVAL_MS` | utils/retentionCleanup.js:57 | INTERNAL/OTHER | used |
| `INTERNAL_RATE_LIMIT_WINDOWS_RETENTION_DAYS` | utils/retentionCleanup.js:56 | INTERNAL/OTHER | used |
| `INTERNAL_RATE_LIMIT_WINDOW_SECONDS` | utils/internalAuth.js:227 | INTERNAL/OTHER | used |
| `GLOBAL_MAX_HTML_CHARS` | utils/limits.js:387 | GLOBAL | used |
| `GLOBAL_MAX_RENDER_HEIGHT` | utils/limits.js:389 | GLOBAL | used |
| `GLOBAL_MAX_RENDER_PIXELS` | utils/limits.js:390 | GLOBAL | used |
| `GLOBAL_MAX_RENDER_WIDTH` | utils/limits.js:388 | GLOBAL | used |
| `GLOBAL_MAX_UPLOAD_BYTES` | utils/limits.js:215 | GLOBAL | used |
| `MONITORING_SNAPSHOTS_CLEANUP_INTERVAL_MS` | utils/monitoringSnapshot.js:14 | INTERNAL/OTHER | used |
| `MONITORING_SNAPSHOTS_RETENTION_HOURS` | utils/monitoringSnapshot.js:13 | INTERNAL/OTHER | used |
| `NODE_ENV` | scripts/verify-production.js:49; utils/config.js:4; utils/limits.js:403; utils/limits.js:404 | INTERNAL/OTHER | used |
| `OUTPUT_CACHE_CONTROL` | utils/config.js:57 | INTERNAL/OTHER | used |
| `OWNER_IMAGE_MAX_DIMENSION_PX` | utils/limits.js:199 | OWNER | used |
| `OWNER_IMAGE_MAX_TOTAL_UPLOAD_MB` | utils/limits.js:198 | OWNER | used |
| `OWNER_MAX_FILES_PER_REQ` | utils/limits.js:213 | OWNER | used |
| `OWNER_PDF_MAX_TOTAL_UPLOAD_MB` | utils/limits.js:202 | OWNER | used |
| `OWNER_TIMEOUT_MS` | utils/limits.js:142 | OWNER | used |
| `OWNER_TOOLS_MAX_DIMENSION_PX` | utils/limits.js:207 | OWNER | used |
| `OWNER_TOOLS_MAX_TOTAL_UPLOAD_MB` | utils/limits.js:206 | OWNER | used |
| `PDF_CONCURRENCY_WAIT_MS` | routes/pdf-route.js:62 | INTERNAL/OTHER | used |
| `GLOBAL_PDF_MAX_PAGES_EXTRACT_IMAGES` | utils/limits.js:435 | GLOBAL | used |
| `GLOBAL_PDF_MAX_PAGES_SPLIT` | utils/limits.js:436 | GLOBAL | used |
| `GLOBAL_PDF_MAX_PAGES_TO_IMAGES` | utils/limits.js:434 | GLOBAL | used |
| `PDF_OUTPUT_CLEANUP_INTERVAL_MS` | server.js:912 | INTERNAL/OTHER | used |
| `PDF_OUTPUT_RETENTION_HOURS` | server.js:912 | INTERNAL/OTHER | used |
| `PIXLAB_LOG_DIR` | utils/logger.js:21 | INTERNAL/OTHER | used |
| `PORT` | scripts/verify-production.js:128; server.js:91; utils/monitoringSnapshot.js:56 | INTERNAL/OTHER | used |
| `PUBLIC_API_KEYS` | server.js:777 | PUBLIC | used |
| `PUBLIC_BASE_URL` | scripts/customer-key-smoke.js:2; scripts/prod-smoke.js:17; scripts/simulate-alert-notification.js:21; scripts/user-summary-smoke.js:2; server.js:165; server.js:414; utils/monitoringSnapshot.js:37 | PUBLIC | used |
| `PUBLIC_H2I_DAILY_LIMIT` | routes/h2i-route.js:62 | PUBLIC | used |
| `PUBLIC_H2I_MAX_HTML_CHARS` | utils/limits.js:395 | PUBLIC | used |
| `PUBLIC_H2I_MAX_RENDER_HEIGHT` | utils/limits.js:397 | PUBLIC | used |
| `PUBLIC_H2I_MAX_RENDER_PIXELS` | utils/limits.js:398 | PUBLIC | used |
| `PUBLIC_H2I_MAX_RENDER_WIDTH` | utils/limits.js:396 | PUBLIC | used |
| `PUBLIC_H2I_TIMEOUT_MS` | utils/limits.js:127 | PUBLIC | used |
| `PUBLIC_IMAGE_DAILY_LIMIT` | routes/image-route.js:54 | PUBLIC | used |
| `PUBLIC_IMAGE_MAX_DIMENSION_PX` | utils/limits.js:179 | PUBLIC | used |
| `PUBLIC_IMAGE_MAX_FILES_PER_REQ` | utils/limits.js:177 | PUBLIC | used |
| `PUBLIC_IMAGE_MAX_TOTAL_UPLOAD_MB` | utils/limits.js:178 | PUBLIC | used |
| `PUBLIC_IMAGE_TIMEOUT_MS` | utils/limits.js:128 | PUBLIC | used |
| `PUBLIC_PDF_DAILY_LIMIT` | routes/pdf-route.js:60 | PUBLIC | used |
| `PUBLIC_PDF_MAX_FILES_PER_REQ` | utils/limits.js:182 | PUBLIC | used |
| `PUBLIC_PDF_MAX_PAGES_EXTRACT_IMAGES` | utils/limits.js:442 | PUBLIC | used |
| `PUBLIC_PDF_MAX_PAGES_SPLIT` | utils/limits.js:443 | PUBLIC | used |
| `PUBLIC_PDF_MAX_PAGES_TO_IMAGES` | utils/limits.js:441 | PUBLIC | used |
| `PUBLIC_PDF_MAX_TOTAL_UPLOAD_MB` | utils/limits.js:183 | PUBLIC | used |
| `PUBLIC_PDF_TIMEOUT_MS` | utils/limits.js:129 | PUBLIC | used |
| `PUBLIC_TOOLS_DAILY_LIMIT` | routes/tools-route.js:70 | PUBLIC | used |
| `PUBLIC_TOOLS_MAX_DIMENSION_PX` | utils/limits.js:189 | PUBLIC | used |
| `PUBLIC_TOOLS_MAX_FILES_PER_REQ` | utils/limits.js:187 | PUBLIC | used |
| `PUBLIC_TOOLS_MAX_TOTAL_UPLOAD_MB` | utils/limits.js:188 | PUBLIC | used |
| `PUBLIC_TOOLS_TIMEOUT_MS` | utils/limits.js:130 | PUBLIC | used |
| `PUPPETEER_EXECUTABLE_PATH` | utils/monitoringSnapshot.js:316 | INTERNAL/OTHER | used |
| `PUPPETEER_NO_SANDBOX` | scripts/verify-production.js:52; utils/config.js:70; utils/monitoringSnapshot.js:317 | INTERNAL/OTHER | used |
| `QUOTA_LEDGER_CLEANUP_BATCH_SIZE` | utils/config.js:196 | INTERNAL/OTHER | used |
| `QUOTA_LEDGER_CLEANUP_INTERVAL_DAYS` | utils/config.js:188 | INTERNAL/OTHER | used |
| `QUOTA_LEDGER_ENABLED` | utils/config.js:172 | INTERNAL/OTHER | used |
| `QUOTA_LEDGER_RECLAIM_BATCH_SIZE` | utils/config.js:184 | INTERNAL/OTHER | used |
| `QUOTA_LEDGER_RECLAIM_INTERVAL_MS` | utils/config.js:180 | INTERNAL/OTHER | used |
| `QUOTA_LEDGER_RETENTION_DAYS` | utils/config.js:192 | INTERNAL/OTHER | used |
| `QUOTA_LEDGER_TTL_SECONDS` | utils/config.js:176 | INTERNAL/OTHER | used |
| `RATE_LIMITS_DAILY_CLEANUP_BATCH_SIZE` | utils/retentionCleanup.js:44 | INTERNAL/OTHER | used |
| `RATE_LIMITS_DAILY_CLEANUP_INITIAL_DELAY_MS` | utils/retentionCleanup.js:43 | INTERNAL/OTHER | used |
| `RATE_LIMITS_DAILY_CLEANUP_INTERVAL_MS` | utils/retentionCleanup.js:42 | INTERNAL/OTHER | used |
| `RATE_LIMITS_DAILY_RETENTION_DAYS` | utils/config.js:156 | INTERNAL/OTHER | used |
| `RATE_LIMITS_DAILY_RETENTION_ENABLED` | utils/config.js:151 | INTERNAL/OTHER | used |
| `RATE_LIMIT_DB_FAILURE_MODE` | utils/config.js:82 | INTERNAL/OTHER | used |
| `RATE_LIMIT_FAIL_CLOSED` | utils/config.js:89 | INTERNAL/OTHER | used |
| `REPRO_API_KEY` | scripts/repro-all-endpoints.js:6 | TOOLING | used |
| `REPRO_BASE_URL` | scripts/repro-all-endpoints.js:5 | TOOLING | used |
| `REQUEST_LOG_CLEANUP_BATCH_SIZE` | utils/retentionCleanup.js:28 | INTERNAL/OTHER | used |
| `REQUEST_LOG_CLEANUP_INITIAL_DELAY_MS` | utils/retentionCleanup.js:27 | INTERNAL/OTHER | used |
| `REQUEST_LOG_CLEANUP_INTERVAL_MS` | utils/retentionCleanup.js:26 | INTERNAL/OTHER | used |
| `REQUEST_LOG_RETENTION_DAYS` | utils/retentionCleanup.js:24 | INTERNAL/OTHER | used |
| `REQUEST_LOG_SCHEMA_ENSURE_ON_STARTUP` | utils/config.js:94 | INTERNAL/OTHER | used |
| `REQUIRE_SIGNED_OUTPUT_URLS` | scripts/verify-production.js:50; utils/config.js:48 | INTERNAL/OTHER | used |
| `SIGNED_URL_ALGO` | utils/config.js:56 | INTERNAL/OTHER | used |
| `SIGNED_URL_SECRET` | utils/config.js:54 | INTERNAL/OTHER | used |
| `SIGNED_URL_TTL_SECONDS` | utils/config.js:55; utils/validateEnv.js:144 | INTERNAL/OTHER | used |
| `SIMULATE_ALERT_EMAIL_RECIPIENTS` | scripts/simulate-alert-notification.js:28 | TOOLING | used |
| `SIMULATE_ALERT_TELEGRAM_TARGETS` | scripts/simulate-alert-notification.js:29 | TOOLING | used |
| `SMOKE_API_KEY` | scripts/prod-smoke.js:18 | TOOLING | used |
| `SNAPSHOT_BASE_URL` | utils/monitoringSnapshot.js:33 | INTERNAL/OTHER | used |
| `SNAPSHOT_FORCE_PORT` | utils/monitoringSnapshot.js:50; utils/monitoringSnapshot.js:51 | INTERNAL/OTHER | used |
| `SUBSCRIPTION_BRIDGE_TOKEN` | routes/subscription-route.js:2396; scripts/customer-key-smoke.js:3; scripts/simulate-alert-notification.js:24; scripts/user-summary-smoke.js:3; scripts/verify-production.js:134; utils/alerts.js:687; utils/alerts.js:688; utils/internalAuth.js:123; utils/internalAuth.js:125; utils/internalAuth.js:130; utils/monitoringSnapshot.js:261; utils/monitoringSnapshot.js:72; utils/monitoringSnapshot.js:73 | INTERNAL/OTHER | used |
| `SUPPORT_EMAIL` | utils/errorResponse.js:106 | INTERNAL/OTHER | used |
| `SUPPORT_URL` | utils/errorResponse.js:107 | INTERNAL/OTHER | used |
| `TEMP_UPLOADS_CLEANUP_INTERVAL_MS` | server.js:970 | INTERNAL/OTHER | used |
| `TEMP_UPLOADS_RETENTION_HOURS` | server.js:969 | INTERNAL/OTHER | used |
| `TEST_CUSTOMER_EMAIL` | scripts/customer-key-smoke.js:4; scripts/user-summary-smoke.js:4 | TOOLING | used |
| `TEST_PLAN_SLUG` | scripts/customer-key-smoke.js:5 | TOOLING | used |
| `TEST_SUBSCRIPTION_ID` | scripts/user-summary-smoke.js:5 | TOOLING | used |
| `TOOLS_CONCURRENCY` | utils/config.js:125 | INTERNAL/OTHER | used |
| `TOOLS_CONCURRENCY_WAIT_MS` | utils/config.js:126 | INTERNAL/OTHER | used |
| `TOOLS_OUTPUT_CLEANUP_INTERVAL_MS` | server.js:913 | INTERNAL/OTHER | used |
| `TOOLS_OUTPUT_RETENTION_HOURS` | server.js:913 | INTERNAL/OTHER | used |
| `TRUST_PROXY` | utils/config.js:35; utils/validateEnv.js:336; utils/validateEnv.js:337 | INTERNAL/OTHER | used |
| `USAGE_MONTHLY_CLEANUP_BATCH_SIZE` | utils/retentionCleanup.js:36 | INTERNAL/OTHER | used |
| `USAGE_MONTHLY_CLEANUP_INITIAL_DELAY_MS` | utils/retentionCleanup.js:35 | INTERNAL/OTHER | used |
| `USAGE_MONTHLY_CLEANUP_INTERVAL_MS` | utils/retentionCleanup.js:34 | INTERNAL/OTHER | used |
| `USAGE_MONTHLY_RETENTION_MONTHS` | utils/retentionCleanup.js:32 | INTERNAL/OTHER | used |
| `VALID_FROM_GRACE_SECONDS` | utils/time.js:4 | INTERNAL/OTHER | used |
| `VERIFY_BASE_URL` | scripts/verify-production.js:128 | TOOLING | used |
| `WEBSITE_URL` | utils/errorResponse.js:108 | INTERNAL/OTHER | used |
