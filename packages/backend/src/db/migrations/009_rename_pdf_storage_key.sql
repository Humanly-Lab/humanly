-- Migration 009: rename pdf_storage_key -> pdf_storage_path
-- The storage backend was changed from GCS (stored GCS object keys)
-- to local disk volume (stores relative filesystem paths).
-- Both represent a "where is the file" pointer, so rename to the
-- more generic term used by the local-disk implementation.

ALTER TABLE papers
  RENAME COLUMN pdf_storage_key TO pdf_storage_path;
