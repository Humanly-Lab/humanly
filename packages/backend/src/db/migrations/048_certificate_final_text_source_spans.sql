ALTER TABLE certificates
  ADD COLUMN IF NOT EXISTS final_text_source_spans JSONB;

COMMENT ON COLUMN certificates.final_text_source_spans IS
  'Snapshot of final text segmented by surviving source spans for certificate provenance visualization';
