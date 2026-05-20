ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS writing_started_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_documents_writing_started_at
  ON documents(writing_started_at)
  WHERE writing_started_at IS NOT NULL;
