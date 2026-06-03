-- Additional indexes for the production admin dashboard, submission replay, and
-- task-submission session completion paths.
--
-- These are intentionally additive and idempotent. They do not change behavior;
-- they give PostgreSQL better options for the hot joins exercised by the
-- production QA playbook.

CREATE INDEX IF NOT EXISTS idx_sessions_task_user_start
  ON sessions(task_id, external_user_id, session_start DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sessions_task_start
  ON sessions(task_id, session_start DESC);

CREATE INDEX IF NOT EXISTS idx_document_events_session_timestamp
  ON document_events(session_id, timestamp ASC)
  WHERE session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_document_events_unlinked_doc_user_created
  ON document_events(document_id, user_id, created_at ASC)
  WHERE session_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_task_enrollments_task_user
  ON task_enrollments(task_id, user_id);

CREATE INDEX IF NOT EXISTS idx_submissions_task_submitted_at
  ON submissions(task_id, submitted_at DESC, created_at DESC);

