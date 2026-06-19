ALTER TABLE tasks
ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ;

UPDATE tasks
SET paused_at = COALESCE(paused_at, updated_at, NOW())
WHERE lifecycle_status = 'paused'
  AND paused_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_paused_at
  ON tasks(paused_at)
  WHERE paused_at IS NOT NULL;
