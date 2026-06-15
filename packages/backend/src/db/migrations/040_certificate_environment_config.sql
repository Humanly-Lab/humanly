ALTER TABLE certificates
  ADD COLUMN IF NOT EXISTS environment_config JSONB;

CREATE INDEX IF NOT EXISTS idx_certificates_environment_config
  ON certificates USING GIN(environment_config)
  WHERE environment_config IS NOT NULL;

COMMENT ON COLUMN certificates.environment_config IS
  'Snapshot of the writing environment configuration active when the certificate was generated';
