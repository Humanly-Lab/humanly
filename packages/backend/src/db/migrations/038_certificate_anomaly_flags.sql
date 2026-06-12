-- Advisory writing-anomaly flags computed at certificate/submission time.
-- Stored on certificates so the integrity seal can protect the exact evidence
-- shown to owners and public certificate viewers. Mirrored to submissions so
-- task owners and export consumers can read flags without reopening certificates.
ALTER TABLE certificates
  ADD COLUMN IF NOT EXISTS anomaly_flags JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS anomaly_flags JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_certificates_anomaly_flags_gin
  ON certificates USING GIN (anomaly_flags);

CREATE INDEX IF NOT EXISTS idx_submissions_anomaly_flags_gin
  ON submissions USING GIN (anomaly_flags);
