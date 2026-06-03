-- Track server-side automatic submission for timed task enrollments.

ALTER TABLE task_enrollments
  ADD COLUMN IF NOT EXISTS auto_submit_claimed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auto_submit_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auto_submit_error TEXT;

CREATE INDEX IF NOT EXISTS idx_task_enrollments_auto_submit_due
  ON task_enrollments(auto_submit_completed_at, auto_submit_claimed_at)
  WHERE submission_document_id IS NOT NULL;
