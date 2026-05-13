DO $$
DECLARE
  legacy_tasks_table text := 'pro' || 'jects';
  legacy_token_column text := 'pro' || 'ject_token';
  legacy_enrollments_table text := 'pro' || 'ject_enrollments';
  legacy_id_column text := 'pro' || 'ject_id';
BEGIN
  IF to_regclass('public.' || legacy_tasks_table) IS NOT NULL AND to_regclass('public.tasks') IS NULL THEN
    EXECUTE format('ALTER TABLE %I RENAME TO tasks', legacy_tasks_table);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tasks'
      AND column_name = legacy_token_column
  ) THEN
    EXECUTE format('ALTER TABLE tasks RENAME COLUMN %I TO task_token', legacy_token_column);
  END IF;

  IF to_regclass('public.' || legacy_enrollments_table) IS NOT NULL AND to_regclass('public.task_enrollments') IS NULL THEN
    EXECUTE format('ALTER TABLE %I RENAME TO task_enrollments', legacy_enrollments_table);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'task_enrollments'
      AND column_name = legacy_id_column
  ) THEN
    EXECUTE format('ALTER TABLE task_enrollments RENAME COLUMN %I TO task_id', legacy_id_column);
  END IF;
END $$;

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS allowed_llm_models TEXT[] NOT NULL DEFAULT ARRAY['GPT-4o mini']::text[],
  ADD COLUMN IF NOT EXISTS ai_usage_limit INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS start_date TIMESTAMP NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS end_date TIMESTAMP NOT NULL DEFAULT (NOW() + INTERVAL '30 days');

DO $$
DECLARE
  legacy_id_column text := 'pro' || 'ject_id';
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sessions' AND column_name = legacy_id_column) THEN
    EXECUTE format('ALTER TABLE sessions RENAME COLUMN %I TO task_id', legacy_id_column);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'events' AND column_name = legacy_id_column) THEN
    EXECUTE format('ALTER TABLE events RENAME COLUMN %I TO task_id', legacy_id_column);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'papers' AND column_name = legacy_id_column) THEN
    EXECUTE format('ALTER TABLE papers RENAME COLUMN %I TO task_id', legacy_id_column);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS submissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    certificate_id UUID REFERENCES certificates(id) ON DELETE SET NULL,
    submitted_at TIMESTAMP NOT NULL DEFAULT NOW(),
    payload_snapshot JSONB NOT NULL,
    plain_text_snapshot TEXT NOT NULL DEFAULT '',
    supersedes_submission_id UUID REFERENCES submissions(id) ON DELETE SET NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'historical')),
    created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE certificates
  ADD COLUMN IF NOT EXISTS submission_id UUID REFERENCES submissions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'active';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'certificates_status_check'
  ) THEN
    ALTER TABLE certificates
      ADD CONSTRAINT certificates_status_check
      CHECK (status IN ('active', 'superseded', 'historical'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tasks_task_token ON tasks(task_token);
CREATE INDEX IF NOT EXISTS idx_tasks_start_date ON tasks(start_date);
CREATE INDEX IF NOT EXISTS idx_tasks_end_date ON tasks(end_date);
CREATE INDEX IF NOT EXISTS idx_task_enrollments_task_id ON task_enrollments(task_id);
CREATE INDEX IF NOT EXISTS idx_submissions_task_user_submitted_at ON submissions(task_id, user_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_document_id ON submissions(document_id);
CREATE INDEX IF NOT EXISTS idx_submissions_certificate_id ON submissions(certificate_id);
CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status);
CREATE INDEX IF NOT EXISTS idx_certificates_submission_id ON certificates(submission_id);
CREATE INDEX IF NOT EXISTS idx_certificates_status ON certificates(status);
