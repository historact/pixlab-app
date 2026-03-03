# ENV usage inventory (canonical, code-derived)

This table is generated from runtime (`server.js`, `db.js`, `routes/*`, `utils/*`, `admin/*`) and official scripts (`scripts/*.js`).
Status is always `used` because every row is code-confirmed.

| ENV_NAME | tier | type | required | default | occurrences (file:line) | status |
|---|---|---|---|---|---|---|
| `ADMIN_AUDIT_LOG_ENABLED` | ADMIN | bool | no | none | utils/logger.js:131; utils/logger.js:232; utils/validateEnv.js:157 | used |
| `ADMIN_LOGIN_LOCKOUTS_CLEANUP_BATCH_SIZE` | ADMIN | int | no | none | utils/retentionCleanup.js:66; utils/validateEnv.js:278 | used |
| `ADMIN_LOGIN_LOCKOUTS_CLEANUP_INITIAL_DELAY_MS` | ADMIN | int | no | none | utils/retentionCleanup.js:65; utils/validateEnv.js:277 | used |
| `ADMIN_LOGIN_LOCKOUTS_CLEANUP_INTERVAL_MS` | ADMIN | int | no | none | utils/retentionCleanup.js:64; utils/validateEnv.js:276 | used |
| `ADMIN_LOGIN_LOCKOUTS_RETENTION_DAYS` | ADMIN | int | no | none | utils/retentionCleanup.js:63; utils/validateEnv.js:275 | used |
| `ADMIN_LOGIN_LOCK_MINUTES` | ADMIN | int | no | 15 | utils/adminAuth.js:29; utils/validateEnv.js:184 | used |
| `ADMIN_LOGIN_MAX_ATTEMPTS` | ADMIN | string | no | 5 | utils/adminAuth.js:28; utils/validateEnv.js:183 | used |
| `ADMIN_LOGIN_WINDOW_MINUTES` | ADMIN | int | no | 15 | utils/adminAuth.js:27; utils/validateEnv.js:182 | used |
| `ADMIN_PASS` | ADMIN | string | yes | null | scripts/verify-production.js:53; server.js:117; utils/validateEnv.js:74 | used |
| `ADMIN_PASSWORD_HASH` | ADMIN | string | yes | '' | utils/adminAuth.js:172; utils/validateEnv.js:86 | used |
| `ADMIN_PATH` | ADMIN | path | no | 'acp' | server.js:116 | used |
| `ADMIN_SESSIONS_CLEANUP_BATCH_SIZE` | ADMIN | int | no | 5000 | server.js:1002; utils/validateEnv.js:291 | used |
| `ADMIN_SESSIONS_CLEANUP_INTERVAL_MS` | ADMIN | int | no | 24 * 60 * 60 * 1000 | server.js:1000; utils/validateEnv.js:290 | used |
| `ADMIN_SESSIONS_RETENTION_DAYS` | ADMIN | int | no | 10 | server.js:1001; utils/validateEnv.js:289 | used |
| `ADMIN_SESSIONS_RETENTION_ENABLED` | ADMIN | bool | no | none | server.js:999; utils/validateEnv.js:170 | used |
| `ADMIN_SESSION_SECRET` | ADMIN | string | yes | required | server.js:502; utils/validateEnv.js:76 | used |
| `ADMIN_TOTP_SECRET` | ADMIN | string | yes | null | utils/adminAuth.js:181; utils/validateEnv.js:75 | used |
| `ALERT_DELIVERIES_RETENTION_BATCH_SIZE` | ALERTING | int | no | 5000 | server.js:103; utils/alertRetentionCleanup.js:13; utils/validateEnv.js:199 | used |
| `ALERT_DELIVERIES_RETENTION_DAYS` | ALERTING | int | no | 90 | server.js:98; utils/alertRetentionCleanup.js:8; utils/validateEnv.js:196 | used |
| `ALERT_DELIVERIES_RETENTION_ENABLED` | ALERTING | bool | no | true | server.js:97; utils/alertRetentionCleanup.js:7; utils/validateEnv.js:168 | used |
| `ALERT_DELIVERIES_RETENTION_INITIAL_DELAY_MS` | ALERTING | int | no | 60 * 1000 | server.js:102; utils/alertRetentionCleanup.js:12; utils/validateEnv.js:198 | used |
| `ALERT_DELIVERIES_RETENTION_INTERVAL_MS` | ALERTING | int | no | 24 * 60 * 60 * 1000 | server.js:100; utils/alertRetentionCleanup.js:10; utils/validateEnv.js:197 | used |
| `ALERT_EMAIL_FROM` | ALERTING | string | no | 'pixlab@localhost' | utils/alerts.js:254 | used |
| `ALERT_EMAIL_HOST` | ALERTING | string | no | none | utils/alerts.js:231 | used |
| `ALERT_EMAIL_JSON_TRANSPORT` | ALERTING | bool | no | '').toLowerCase() === 'true') { | scripts/test-alert-notification-pipeline.js:42; utils/alerts.js:232 | used |
| `ALERT_EMAIL_PASS` | ALERTING | string | no | null | utils/alerts.js:239 | used |
| `ALERT_EMAIL_PORT` | ALERTING | int | no | 587 | utils/alerts.js:236; utils/validateEnv.js:185 | used |
| `ALERT_EMAIL_SECURE` | ALERTING | bool | no | '').toLowerCase() === 'true' | utils/alerts.js:237 | used |
| `ALERT_EMAIL_USER` | ALERTING | string | no | null | utils/alerts.js:238 | used |
| `ALERT_EVENTS_RETENTION_BATCH_SIZE` | ALERTING | int | no | 5000 | server.js:108; utils/alertRetentionCleanup.js:20; utils/validateEnv.js:203 | used |
| `ALERT_EVENTS_RETENTION_DAYS` | ALERTING | int | no | 90 | server.js:105; utils/alertRetentionCleanup.js:16; utils/validateEnv.js:200 | used |
| `ALERT_EVENTS_RETENTION_ENABLED` | ALERTING | bool | no | true | server.js:104; utils/alertRetentionCleanup.js:15; utils/validateEnv.js:169 | used |
| `ALERT_EVENTS_RETENTION_INITIAL_DELAY_MS` | ALERTING | int | no | 60 * 1000 | server.js:107; utils/alertRetentionCleanup.js:19; utils/validateEnv.js:202 | used |
| `ALERT_EVENTS_RETENTION_INTERVAL_MS` | ALERTING | int | no | 24 * 60 * 60 * 1000 | server.js:106; utils/alertRetentionCleanup.js:17; utils/validateEnv.js:201 | used |
| `ALERT_TELEGRAM_API_BASE_URL` | ALERTING | url | no | 'https://api.telegram.org' | scripts/test-alert-notification-pipeline.js:41; utils/alerts.js:338 | used |
| `ALERT_TELEGRAM_BOT_TOKEN` | ALERTING | string | no | none | scripts/test-alert-notification-pipeline.js:40; utils/alerts.js:357; utils/alerts.js:467 | used |
| `API_KEYS` | OWNER | list | no | '') | server.js:775; utils/validateEnv.js:91 | used |
| `API_KEYS_EXPIRY_WATCHER_BATCH_SIZE` | INTERNAL | int | no | 500 | server.js:94; utils/validateEnv.js:187 | used |
| `API_KEYS_EXPIRY_WATCHER_ENABLED` | INTERNAL | bool | no | true | server.js:92; utils/validateEnv.js:158 | used |
| `API_KEYS_EXPIRY_WATCHER_INTERVAL_MS` | INTERNAL | int | no | 10 * 60 * 1000 | server.js:93; utils/validateEnv.js:186 | used |
| `API_KEYS_RETENTION_CLEANUP_BATCH_SIZE` | INTERNAL | int | no | 5000 | server.js:124; utils/config.js:217; utils/validateEnv.js:193 | used |
| `API_KEYS_RETENTION_CLEANUP_ENABLED` | INTERNAL | bool | no | false | server.js:120; utils/config.js:201; utils/validateEnv.js:160 | used |
| `API_KEYS_RETENTION_CLEANUP_INITIAL_DELAY_MS` | INTERNAL | int | no | 60 * 1000 | server.js:123; utils/config.js:213; utils/validateEnv.js:192 | used |
| `API_KEYS_RETENTION_CLEANUP_INTERVAL_MS` | INTERNAL | int | no | 24 * 60 * 60 * 1000 | server.js:122; utils/config.js:209; utils/validateEnv.js:191 | used |
| `API_KEYS_RETENTION_DAYS` | INTERNAL | int | no | 180 | server.js:121; utils/config.js:205; utils/validateEnv.js:190 | used |
| `AUTO_RUN_MIGRATIONS` | INTERNAL | string | no | none | utils/config.js:98 | used |
| `BODY_PARSER_JSON_LIMIT` | INTERNAL | int | no | '20mb' | utils/limits.js:113 | used |
| `BURST_LIMITS_WINDOW_CLEANUP_BATCH_SIZE` | INTERNAL | int | no | none | utils/retentionCleanup.js:52; utils/validateEnv.js:270 | used |
| `BURST_LIMITS_WINDOW_CLEANUP_INITIAL_DELAY_MS` | INTERNAL | int | no | none | utils/retentionCleanup.js:51; utils/validateEnv.js:269 | used |
| `BURST_LIMITS_WINDOW_CLEANUP_INTERVAL_MS` | INTERNAL | int | no | none | utils/retentionCleanup.js:50; utils/validateEnv.js:268 | used |
| `BURST_LIMITS_WINDOW_RETENTION_DAYS` | INTERNAL | int | no | none | utils/config.js:166; utils/validateEnv.js:256 | used |
| `BURST_LIMITS_WINDOW_RETENTION_ENABLED` | INTERNAL | bool | no | none | utils/config.js:161; utils/validateEnv.js:164 | used |
| `CORS_ORIGINS` | INTERNAL | list | no | 'https://h2i.davix.dev,https://davix.dev,https://www.davix.dev' | server.js:461 | used |
| `DAVIX_DEBUG_INTERNAL` | DIAGNOSTICS | bool | no | false (unless set to '1') | admin/adminRoutes.js:2444; admin/adminRoutes.js:2481; admin/adminRoutes.js:3060; routes/h2i-route.js:67; routes/subscription-route.js:39; utils/customerKeys.js:13 | used |
| `DB_HOST` | INTERNAL | string | no | 'localhost', | db.js:8; db.js:241; scripts/verify-schema.js:36; server.js:511; utils/validateEnv.js:92 | used |
| `DB_NAME` | INTERNAL | string | no | 'pixlab', | db.js:11; db.js:244; scripts/verify-schema.js:36; server.js:514; utils/validateEnv.js:94 | used |
| `DB_ORPHAN_CLEANUP_ENABLED` | INTERNAL | bool | no | true | server.js:95; utils/orphanCleanup.js:10; utils/validateEnv.js:161 | used |
| `DB_PASS` | INTERNAL | string | no | '', | db.js:10; db.js:243; server.js:513 | used |
| `DB_RETENTION_CLEANUP_ENABLED` | INTERNAL | bool | no | true | server.js:96; utils/retentionCleanup.js:18; utils/validateEnv.js:167 | used |
| `DB_RETENTION_LOG_PATH` | DIAGNOSTICS | path | no | null | utils/retentionCleanup.js:19 | used |
| `DB_USER` | INTERNAL | string | no | 'root', | db.js:9; db.js:242; scripts/verify-schema.js:36; server.js:512; utils/validateEnv.js:93 | used |
| `ENABLE_DIAGNOSTICS` | DIAGNOSTICS | string | no | none | utils/config.js:131 | used |
| `GLOBAL_MAX_FILES_PER_REQ` | GLOBAL | string | no | none | utils/config.js:76; utils/validateEnv.js:257 | used |
| `GLOBAL_MAX_HTML_CHARS` | GLOBAL | string | no | none | utils/limits.js:387; utils/validateEnv.js:242 | used |
| `GLOBAL_MAX_RENDER_HEIGHT` | GLOBAL | int | no | none | utils/limits.js:389; utils/validateEnv.js:245 | used |
| `GLOBAL_MAX_RENDER_PIXELS` | GLOBAL | int | no | none | utils/limits.js:390; utils/validateEnv.js:243 | used |
| `GLOBAL_MAX_RENDER_WIDTH` | GLOBAL | int | no | none | utils/limits.js:388; utils/validateEnv.js:244 | used |
| `GLOBAL_MAX_TOTAL_UPLOAD_MB` | GLOBAL | string | no | none | utils/config.js:75; utils/validateEnv.js:308 | used |
| `GLOBAL_MAX_UPLOAD_BYTES` | GLOBAL | string | no | none | utils/limits.js:224; utils/validateEnv.js:241 | used |
| `GLOBAL_PDF_MAX_PAGES_EXTRACT_IMAGES` | GLOBAL | string | no | none | utils/limits.js:435 | used |
| `GLOBAL_PDF_MAX_PAGES_SPLIT` | GLOBAL | string | no | none | utils/limits.js:436 | used |
| `GLOBAL_PDF_MAX_PAGES_TO_IMAGES` | GLOBAL | string | no | none | utils/limits.js:434 | used |
| `H2I_ALLOW_FILE_SCHEME` | INTERNAL | string | no | none | utils/config.js:64; utils/validateEnv.js:159 | used |
| `H2I_BLOCK_PRIVATE_NETWORK` | INTERNAL | string | no | none | utils/config.js:63; utils/config.js:141; utils/validateEnv.js:160 | used |
| `H2I_CONCURRENCY` | INTERNAL | int | no | none | utils/config.js:109 | used |
| `H2I_CONCURRENCY_WAIT_MS` | INTERNAL | int | no | none | utils/config.js:110 | used |
| `H2I_DNS_REBINDING_MODE` | INTERNAL | enum | no | '').toString().trim().toLowerCase() | utils/config.js:139; utils/validateEnv.js:325 | used |
| `H2I_OUTPUT_CLEANUP_INTERVAL_MS` | INTERNAL | int | no | none | server.js:910; utils/validateEnv.js:206 | used |
| `H2I_OUTPUT_RETENTION_HOURS` | INTERNAL | int | no | none | server.js:910; utils/validateEnv.js:205 | used |
| `IMAGE_CONCURRENCY` | INTERNAL | int | no | none | utils/config.js:117 | used |
| `IMAGE_CONCURRENCY_WAIT_MS` | INTERNAL | int | no | none | utils/config.js:118 | used |
| `IMAGE_OUTPUT_CLEANUP_INTERVAL_MS` | INTERNAL | int | no | none | server.js:911; utils/validateEnv.js:208 | used |
| `IMAGE_OUTPUT_RETENTION_HOURS` | INTERNAL | int | no | none | server.js:911; utils/validateEnv.js:207 | used |
| `INTERNAL_ALLOWED_IPS` | INTERNAL | list | no | '').trim() | scripts/verify-production.js:51; utils/internalAuth.js:17; utils/internalAuth.js:97; utils/validateEnv.js:98 | used |
| `INTERNAL_BASE_URL` | INTERNAL | url | no | none | utils/monitoringSnapshot.js:41 | used |
| `INTERNAL_RATE_LIMIT_PER_MIN` | INTERNAL | string | no | 60 | utils/internalAuth.js:226 | used |
| `INTERNAL_RATE_LIMIT_WINDOWS_CLEANUP_BATCH_SIZE` | INTERNAL | int | no | none | utils/retentionCleanup.js:59; utils/validateEnv.js:274 | used |
| `INTERNAL_RATE_LIMIT_WINDOWS_CLEANUP_INITIAL_DELAY_MS` | INTERNAL | int | no | none | utils/retentionCleanup.js:58; utils/validateEnv.js:273 | used |
| `INTERNAL_RATE_LIMIT_WINDOWS_CLEANUP_INTERVAL_MS` | INTERNAL | int | no | none | utils/retentionCleanup.js:57; utils/validateEnv.js:272 | used |
| `INTERNAL_RATE_LIMIT_WINDOWS_RETENTION_DAYS` | INTERNAL | int | no | none | utils/retentionCleanup.js:56; utils/validateEnv.js:271 | used |
| `INTERNAL_RATE_LIMIT_WINDOW_SECONDS` | INTERNAL | int | no | 60 | utils/internalAuth.js:227 | used |
| `MONITORING_SNAPSHOTS_CLEANUP_INTERVAL_MS` | DIAGNOSTICS | int | no | (6 * 60 * 60 * 1000)) | utils/monitoringSnapshot.js:14; utils/validateEnv.js:216 | used |
| `MONITORING_SNAPSHOTS_RETENTION_HOURS` | DIAGNOSTICS | int | no | (7 * 24)) * 60 * 60 * 1000 | utils/monitoringSnapshot.js:13; utils/validateEnv.js:215 | used |
| `NODE_ENV` | INTERNAL | enum | no | none | scripts/verify-production.js:49; utils/config.js:4; utils/limits.js:429; utils/limits.js:430 | used |
| `OUTPUT_CACHE_CONTROL` | INTERNAL | string | no | 'private, no-store', | utils/config.js:57 | used |
| `OWNER_IMAGE_MAX_DIMENSION_PX` | OWNER | int | no | none | utils/validateEnv.js:236 | used |
| `OWNER_IMAGE_MAX_TOTAL_UPLOAD_MB` | OWNER | string | no | none | utils/validateEnv.js:235 | used |
| `OWNER_MAX_FILES_PER_REQ` | OWNER | string | no | none | utils/limits.js:213; utils/validateEnv.js:240 | used |
| `OWNER_PDF_MAX_TOTAL_UPLOAD_MB` | OWNER | string | no | none | utils/validateEnv.js:237 | used |
| `OWNER_TIMEOUT_MS` | OWNER | int | no | none | utils/limits.js:142; utils/validateEnv.js:226 | used |
| `OWNER_TOOLS_MAX_DIMENSION_PX` | OWNER | int | no | none | utils/validateEnv.js:239 | used |
| `OWNER_TOOLS_MAX_TOTAL_UPLOAD_MB` | OWNER | string | no | none | utils/validateEnv.js:238 | used |
| `PDF_CONCURRENCY` | INTERNAL | int | no | none | routes/pdf-route.js:61 | used |
| `PDF_CONCURRENCY_WAIT_MS` | INTERNAL | int | no | 15000 | routes/pdf-route.js:62 | used |
| `PDF_OUTPUT_CLEANUP_INTERVAL_MS` | INTERNAL | int | no | none | server.js:912; utils/validateEnv.js:210 | used |
| `PDF_OUTPUT_RETENTION_HOURS` | INTERNAL | int | no | none | server.js:912; utils/validateEnv.js:209 | used |
| `PIXLAB_LOG_DIR` | DIAGNOSTICS | path | no | '').trim() | utils/logger.js:21 | used |
| `PORT` | INTERNAL | int | no | 3005 | scripts/verify-production.js:128; server.js:91; utils/monitoringSnapshot.js:56 | used |
| `PUBLIC_API_KEYS` | PUBLIC | list | no | '') | server.js:777 | used |
| `PUBLIC_BASE_URL` | PUBLIC | url | no | `http://localhost:${PORT}` | scripts/customer-key-smoke.js:2; scripts/prod-smoke.js:17; scripts/simulate-alert-notification.js:21; scripts/user-summary-smoke.js:2; server.js:165; server.js:414; utils/monitoringSnapshot.js:37; utils/validateEnv.js:95 | used |
| `PUBLIC_H2I_DAILY_LIMIT` | PUBLIC | int | no | none | routes/h2i-route.js:62; utils/validateEnv.js:218 | used |
| `PUBLIC_H2I_MAX_HTML_CHARS` | PUBLIC | string | no | none | utils/limits.js:395; utils/validateEnv.js:246 | used |
| `PUBLIC_H2I_MAX_RENDER_HEIGHT` | PUBLIC | int | no | none | utils/limits.js:397; utils/validateEnv.js:248 | used |
| `PUBLIC_H2I_MAX_RENDER_PIXELS` | PUBLIC | int | no | none | utils/limits.js:398; utils/validateEnv.js:249 | used |
| `PUBLIC_H2I_MAX_RENDER_WIDTH` | PUBLIC | int | no | none | utils/limits.js:396; utils/validateEnv.js:247 | used |
| `PUBLIC_H2I_TIMEOUT_MS` | PUBLIC | int | no | none | utils/validateEnv.js:222 | used |
| `PUBLIC_IMAGE_DAILY_LIMIT` | PUBLIC | int | no | none | routes/image-route.js:54; utils/validateEnv.js:219 | used |
| `PUBLIC_IMAGE_MAX_DIMENSION_PX` | PUBLIC | int | no | none | utils/limits.js:179; utils/validateEnv.js:229 | used |
| `PUBLIC_IMAGE_MAX_FILES_PER_REQ` | PUBLIC | string | no | none | utils/limits.js:177; utils/validateEnv.js:227 | used |
| `PUBLIC_IMAGE_MAX_TOTAL_UPLOAD_MB` | PUBLIC | string | no | none | utils/limits.js:178; utils/validateEnv.js:228 | used |
| `PUBLIC_IMAGE_TIMEOUT_MS` | PUBLIC | int | no | none | utils/validateEnv.js:223 | used |
| `PUBLIC_PDF_DAILY_LIMIT` | PUBLIC | int | no | none | routes/pdf-route.js:60; utils/validateEnv.js:220 | used |
| `PUBLIC_PDF_MAX_FILES_PER_REQ` | PUBLIC | string | no | none | utils/limits.js:182; utils/validateEnv.js:230 | used |
| `PUBLIC_PDF_MAX_PAGES_EXTRACT_IMAGES` | PUBLIC | string | no | none | utils/limits.js:442; utils/validateEnv.js:251 | used |
| `PUBLIC_PDF_MAX_PAGES_SPLIT` | PUBLIC | string | no | none | utils/limits.js:443; utils/validateEnv.js:252 | used |
| `PUBLIC_PDF_MAX_PAGES_TO_IMAGES` | PUBLIC | string | no | none | utils/limits.js:441; utils/validateEnv.js:250 | used |
| `PUBLIC_PDF_MAX_TOTAL_UPLOAD_MB` | PUBLIC | string | no | none | utils/limits.js:183; utils/validateEnv.js:231 | used |
| `PUBLIC_PDF_TIMEOUT_MS` | PUBLIC | int | no | none | utils/validateEnv.js:224 | used |
| `PUBLIC_TOOLS_DAILY_LIMIT` | PUBLIC | int | no | none | routes/tools-route.js:70; utils/validateEnv.js:221 | used |
| `PUBLIC_TOOLS_MAX_DIMENSION_PX` | PUBLIC | int | no | none | utils/limits.js:189; utils/validateEnv.js:234 | used |
| `PUBLIC_TOOLS_MAX_FILES_PER_REQ` | PUBLIC | string | no | none | utils/limits.js:187; utils/validateEnv.js:232 | used |
| `PUBLIC_TOOLS_MAX_TOTAL_UPLOAD_MB` | PUBLIC | string | no | none | utils/limits.js:188; utils/validateEnv.js:233 | used |
| `PUBLIC_TOOLS_TIMEOUT_MS` | PUBLIC | int | no | none | utils/validateEnv.js:225 | used |
| `PUPPETEER_EXECUTABLE_PATH` | INTERNAL | path | no | null, | utils/monitoringSnapshot.js:316 | used |
| `PUPPETEER_NO_SANDBOX` | INTERNAL | bool | no | null, | scripts/verify-production.js:52; utils/config.js:70; utils/monitoringSnapshot.js:317; utils/validateEnv.js:162 | used |
| `QUOTA_LEDGER_CLEANUP_BATCH_SIZE` | INTERNAL | int | no | none | utils/config.js:196; utils/validateEnv.js:193 | used |
| `QUOTA_LEDGER_CLEANUP_INTERVAL_DAYS` | INTERNAL | int | no | none | utils/config.js:188; utils/validateEnv.js:191 | used |
| `QUOTA_LEDGER_ENABLED` | INTERNAL | bool | no | none | utils/config.js:172; utils/validateEnv.js:165 | used |
| `QUOTA_LEDGER_RECLAIM_BATCH_SIZE` | INTERNAL | int | no | none | utils/config.js:184; utils/validateEnv.js:190 | used |
| `QUOTA_LEDGER_RECLAIM_INTERVAL_MS` | INTERNAL | int | no | none | utils/config.js:180; utils/validateEnv.js:189 | used |
| `QUOTA_LEDGER_RETENTION_DAYS` | INTERNAL | int | no | none | utils/config.js:192; utils/validateEnv.js:192 | used |
| `QUOTA_LEDGER_TTL_SECONDS` | INTERNAL | int | no | none | utils/config.js:176; utils/validateEnv.js:188 | used |
| `RATE_LIMITS_DAILY_CLEANUP_BATCH_SIZE` | INTERNAL | int | no | none | utils/retentionCleanup.js:44; utils/validateEnv.js:267 | used |
| `RATE_LIMITS_DAILY_CLEANUP_INITIAL_DELAY_MS` | INTERNAL | int | no | none | utils/retentionCleanup.js:43; utils/validateEnv.js:266 | used |
| `RATE_LIMITS_DAILY_CLEANUP_INTERVAL_MS` | INTERNAL | int | no | none | utils/retentionCleanup.js:42; utils/validateEnv.js:265 | used |
| `RATE_LIMITS_DAILY_RETENTION_DAYS` | INTERNAL | int | no | none | utils/config.js:156; utils/validateEnv.js:255 | used |
| `RATE_LIMITS_DAILY_RETENTION_ENABLED` | INTERNAL | bool | no | none | utils/config.js:151; utils/validateEnv.js:163 | used |
| `RATE_LIMIT_DB_FAILURE_MODE` | INTERNAL | enum | no | memory | utils/config.js:82; utils/validateEnv.js:324 | used |
| `RATE_LIMIT_FAIL_CLOSED` | INTERNAL | bool | no | true (production), false (non-production) | utils/config.js:89 | used |
| `REPRO_API_KEY` | TOOLING | string | no | none | scripts/repro-all-endpoints.js:6 | used |
| `REPRO_BASE_URL` | TOOLING | url | no | 'http://localhost:3005' | scripts/repro-all-endpoints.js:5 | used |
| `REQUEST_LOG_CLEANUP_BATCH_SIZE` | INTERNAL | int | no | none | utils/retentionCleanup.js:28; utils/validateEnv.js:261 | used |
| `REQUEST_LOG_CLEANUP_INITIAL_DELAY_MS` | INTERNAL | int | no | none | utils/retentionCleanup.js:27; utils/validateEnv.js:260 | used |
| `REQUEST_LOG_CLEANUP_INTERVAL_MS` | INTERNAL | int | no | none | utils/retentionCleanup.js:26; utils/validateEnv.js:259 | used |
| `REQUEST_LOG_ORPHAN_CLEANUP_BATCH_SIZE` | INTERNAL | int | no | none | utils/validateEnv.js:281 | used |
| `REQUEST_LOG_ORPHAN_CLEANUP_INITIAL_DELAY_MS` | INTERNAL | int | no | none | utils/validateEnv.js:280 | used |
| `REQUEST_LOG_ORPHAN_CLEANUP_INTERVAL_MS` | INTERNAL | int | no | none | utils/validateEnv.js:279 | used |
| `REQUEST_LOG_RETENTION_DAYS` | INTERNAL | int | no | none | utils/retentionCleanup.js:24; utils/validateEnv.js:194 | used |
| `REQUEST_LOG_SCHEMA_ENSURE_ON_STARTUP` | INTERNAL | string | no | none | utils/config.js:94 | used |
| `REQUIRE_SIGNED_OUTPUT_URLS` | INTERNAL | bool | no | true (production), false (non-production) | scripts/verify-production.js:50; utils/config.js:48; utils/validateEnv.js:166 | used |
| `SIGNED_URL_ALGO` | INTERNAL | enum | no | 'sha256', | utils/config.js:56 | used |
| `SIGNED_URL_SECRET` | INTERNAL | string | yes when signing enabled | '' | utils/config.js:54 | used |
| `SIGNED_URL_TTL_SECONDS` | INTERNAL | int | no (validated when signing enabled) | 86400 (config fallback) | utils/config.js:55; utils/validateEnv.js:144; utils/validateEnv.js:253 | used |
| `SIMULATE_ALERT_EMAIL_RECIPIENTS` | TOOLING | list | no | none | scripts/simulate-alert-notification.js:28 | used |
| `SIMULATE_ALERT_TELEGRAM_TARGETS` | TOOLING | list | no | none | scripts/simulate-alert-notification.js:29 | used |
| `SMOKE_API_KEY` | TOOLING | string | no | '') | scripts/prod-smoke.js:18 | used |
| `SNAPSHOT_BASE_URL` | DIAGNOSTICS | url | no | none | utils/monitoringSnapshot.js:33 | used |
| `SNAPSHOT_FORCE_PORT` | DIAGNOSTICS | int | no | none | utils/monitoringSnapshot.js:50; utils/monitoringSnapshot.js:51 | used |
| `SUBSCRIPTION_BRIDGE_TOKEN` | INTERNAL | string | yes | '' | routes/subscription-route.js:2396; scripts/customer-key-smoke.js:3; scripts/simulate-alert-notification.js:24; scripts/user-summary-smoke.js:3; scripts/verify-production.js:134; utils/alerts.js:687; utils/alerts.js:688; utils/internalAuth.js:123; utils/internalAuth.js:125; utils/internalAuth.js:130; utils/monitoringSnapshot.js:72; utils/monitoringSnapshot.js:73; utils/monitoringSnapshot.js:261; utils/validateEnv.js:77 | used |
| `SUBSCRIPTION_EVENTS_CLEANUP_BATCH_SIZE` | INTERNAL | int | no | none | utils/validateEnv.js:288 | used |
| `SUBSCRIPTION_EVENTS_CLEANUP_INITIAL_DELAY_MS` | INTERNAL | int | no | none | utils/validateEnv.js:287 | used |
| `SUBSCRIPTION_EVENTS_CLEANUP_INTERVAL_MS` | INTERNAL | int | no | none | utils/validateEnv.js:286 | used |
| `SUBSCRIPTION_EVENTS_RETENTION_DAYS` | INTERNAL | int | no | none | utils/validateEnv.js:285 | used |
| `SUPPORT_EMAIL` | INTERNAL | string | no | '').trim() | utils/errorResponse.js:106 | used |
| `SUPPORT_URL` | INTERNAL | url | no | '').trim() | utils/errorResponse.js:107 | used |
| `TEMP_UPLOADS_CLEANUP_INTERVAL_MS` | INTERNAL | int | no | none | server.js:970; utils/validateEnv.js:214 | used |
| `TEMP_UPLOADS_RETENTION_HOURS` | INTERNAL | int | no | none | server.js:969; utils/validateEnv.js:213 | used |
| `TEST_CUSTOMER_EMAIL` | TOOLING | string | no | 'test@example.com' | scripts/customer-key-smoke.js:4; scripts/user-summary-smoke.js:4 | used |
| `TEST_PLAN_SLUG` | TOOLING | string | no | 'dev-plan' | scripts/customer-key-smoke.js:5 | used |
| `TEST_SUBSCRIPTION_ID` | TOOLING | string | no | null | scripts/user-summary-smoke.js:5 | used |
| `TOOLS_CONCURRENCY` | INTERNAL | int | no | none | utils/config.js:125 | used |
| `TOOLS_CONCURRENCY_WAIT_MS` | INTERNAL | int | no | none | utils/config.js:126 | used |
| `TOOLS_OUTPUT_CLEANUP_INTERVAL_MS` | INTERNAL | int | no | none | server.js:913; utils/validateEnv.js:212 | used |
| `TOOLS_OUTPUT_RETENTION_HOURS` | INTERNAL | int | no | none | server.js:913; utils/validateEnv.js:211 | used |
| `TRUST_PROXY` | INTERNAL | enum | yes (production) | none | utils/config.js:35; utils/validateEnv.js:336; utils/validateEnv.js:337 | used |
| `USAGE_MONTHLY_CLEANUP_BATCH_SIZE` | INTERNAL | int | no | none | utils/retentionCleanup.js:36; utils/validateEnv.js:264 | used |
| `USAGE_MONTHLY_CLEANUP_INITIAL_DELAY_MS` | INTERNAL | int | no | none | utils/retentionCleanup.js:35; utils/validateEnv.js:263 | used |
| `USAGE_MONTHLY_CLEANUP_INTERVAL_MS` | INTERNAL | int | no | none | utils/retentionCleanup.js:34; utils/validateEnv.js:262 | used |
| `USAGE_MONTHLY_ORPHAN_CLEANUP_BATCH_SIZE` | INTERNAL | int | no | none | utils/validateEnv.js:284 | used |
| `USAGE_MONTHLY_ORPHAN_CLEANUP_INITIAL_DELAY_MS` | INTERNAL | int | no | none | utils/validateEnv.js:283 | used |
| `USAGE_MONTHLY_ORPHAN_CLEANUP_INTERVAL_MS` | INTERNAL | int | no | none | utils/validateEnv.js:282 | used |
| `USAGE_MONTHLY_RETENTION_MONTHS` | INTERNAL | int | no | none | utils/retentionCleanup.js:32; utils/validateEnv.js:195 | used |
| `VALID_FROM_GRACE_SECONDS` | INTERNAL | int | no | 120 | utils/time.js:4; utils/validateEnv.js:254 | used |
| `VERIFY_BASE_URL` | TOOLING | url | no | `http://127.0.0.1:${process.env.PORT || 3005}` | scripts/verify-production.js:128 | used |
| `WEBSITE_URL` | INTERNAL | url | no | '').trim() | utils/errorResponse.js:108 | used |
