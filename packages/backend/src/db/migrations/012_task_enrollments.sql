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

CREATE TABLE IF NOT EXISTS task_enrollments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(task_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_task_enrollments_task_id
    ON task_enrollments(task_id);

CREATE INDEX IF NOT EXISTS idx_task_enrollments_user_id
    ON task_enrollments(user_id);
