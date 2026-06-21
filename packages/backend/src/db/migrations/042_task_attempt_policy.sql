-- Explicit task attempts for admin-assigned writing tasks.
-- The enrollment keeps pointing to the current active attempt document, while
-- this table preserves prior attempt documents and makes restarts explicit.

CREATE TABLE IF NOT EXISTS task_attempts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL CHECK (attempt_number >= 1),
  status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'historical')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(task_id, user_id, attempt_number),
  UNIQUE(document_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_task_attempts_one_active
  ON task_attempts(task_id, user_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_task_attempts_task_user
  ON task_attempts(task_id, user_id, attempt_number DESC);

CREATE INDEX IF NOT EXISTS idx_task_attempts_document_id
  ON task_attempts(document_id);

ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS task_attempt_id UUID REFERENCES task_attempts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_submissions_task_attempt_id
  ON submissions(task_attempt_id)
  WHERE task_attempt_id IS NOT NULL;

INSERT INTO task_attempts (
  task_id,
  user_id,
  document_id,
  attempt_number,
  status,
  started_at,
  created_at,
  updated_at
)
SELECT
  te.task_id,
  te.user_id,
  te.submission_document_id,
  1,
  'active',
  COALESCE(d.writing_started_at, d.created_at, te.joined_at, NOW()),
  COALESCE(d.created_at, te.joined_at, NOW()),
  COALESCE(d.updated_at, d.created_at, te.joined_at, NOW())
FROM task_enrollments te
LEFT JOIN documents d ON d.id = te.submission_document_id
WHERE te.submission_document_id IS NOT NULL
ON CONFLICT (document_id) DO NOTHING;

UPDATE submissions s
SET task_attempt_id = ta.id
FROM task_attempts ta
WHERE s.task_attempt_id IS NULL
  AND ta.task_id = s.task_id
  AND ta.user_id = s.user_id
  AND ta.document_id = s.document_id;

COMMENT ON TABLE task_attempts IS
  'Durable attempt records for assigned tasks; new attempts never overwrite older evidence.';

COMMENT ON COLUMN task_attempts.status IS
  'The current attempt for a task/user is active; prior restart attempts remain historical.';

COMMENT ON COLUMN submissions.task_attempt_id IS
  'Task attempt this immutable submission/certificate was generated from.';
