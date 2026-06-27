-- Support paginated publisher submission lists without sorting the whole task.

CREATE INDEX IF NOT EXISTS idx_submissions_task_submitted_created_id
  ON submissions(task_id, submitted_at DESC, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_submissions_task_user_submitted_created_id
  ON submissions(task_id, user_id, submitted_at DESC, created_at DESC, id DESC);
