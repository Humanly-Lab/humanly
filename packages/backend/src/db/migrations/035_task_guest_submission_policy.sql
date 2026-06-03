ALTER TABLE tasks
ADD COLUMN IF NOT EXISTS allow_guest_submissions BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN tasks.allow_guest_submissions IS
  'Whether the public task share link allows anonymous guest writing and submission.';
