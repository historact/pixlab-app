ALTER TABLE request_log
  ADD COLUMN IF NOT EXISTS request_id VARCHAR(64) NULL AFTER api_key_id,
  ADD UNIQUE KEY uq_request_log_api_key_id_request_id (api_key_id, request_id);
