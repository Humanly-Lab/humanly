-- Migration 009: rename pdf_storage_key -> pdf_storage_path
-- The storage backend was changed from GCS (stored GCS object keys)
-- to local disk volume (stores relative filesystem paths).
-- Both represent a "where is the file" pointer, so rename to the
-- more generic term used by the local-disk implementation.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'papers'
      AND column_name = 'pdf_storage_key'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'papers'
      AND column_name = 'pdf_storage_path'
  ) THEN
    ALTER TABLE papers
      RENAME COLUMN pdf_storage_key TO pdf_storage_path;
  END IF;
END $$;
