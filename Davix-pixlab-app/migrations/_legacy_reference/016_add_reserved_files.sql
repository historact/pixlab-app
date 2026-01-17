ALTER TABLE usage_monthly
  ADD COLUMN IF NOT EXISTS reserved_files BIGINT NOT NULL DEFAULT 0 AFTER used_files;
