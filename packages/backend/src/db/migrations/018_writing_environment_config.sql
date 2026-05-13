ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS environment_config JSONB;

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS environment_config JSONB;

CREATE INDEX IF NOT EXISTS idx_tasks_environment_config
  ON tasks USING GIN(environment_config)
  WHERE environment_config IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_documents_environment_config
  ON documents USING GIN(environment_config)
  WHERE environment_config IS NOT NULL;
