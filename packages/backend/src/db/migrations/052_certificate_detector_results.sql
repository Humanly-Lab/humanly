-- Persist certificate-time detector policy/results without changing legacy seals.
ALTER TABLE certificates
  ADD COLUMN IF NOT EXISTS detector_results JSONB;

ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS detector_results JSONB;
