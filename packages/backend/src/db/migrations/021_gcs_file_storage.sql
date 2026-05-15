ALTER TABLE files
  ADD COLUMN IF NOT EXISTS storage_bucket VARCHAR(255),
  ADD COLUMN IF NOT EXISTS storage_region VARCHAR(100),
  ADD COLUMN IF NOT EXISTS storage_etag VARCHAR(255),
  ADD COLUMN IF NOT EXISTS upload_status VARCHAR(30) NOT NULL DEFAULT 'ready';

DO $$
BEGIN
  ALTER TABLE files
    ADD CONSTRAINT files_upload_status_check
    CHECK (upload_status IN ('pending', 'ready', 'failed'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_files_storage_provider
  ON files(storage_provider);

CREATE INDEX IF NOT EXISTS idx_files_upload_status
  ON files(upload_status);
