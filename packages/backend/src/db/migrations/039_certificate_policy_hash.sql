-- Hash of the active owner AI policy text bound into new certificate seals.
-- Existing certificates remain NULL and continue to verify against their
-- original seal payload.
ALTER TABLE certificates
  ADD COLUMN IF NOT EXISTS policy_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_certificates_policy_hash
  ON certificates(policy_hash)
  WHERE policy_hash IS NOT NULL;

COMMENT ON COLUMN certificates.policy_hash IS 'SHA-256 hash of the active AI policy text sealed into new certificate records';
