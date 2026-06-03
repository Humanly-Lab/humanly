BEGIN;

DO $$
BEGIN
  IF to_regclass('public.tasks') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'tasks'
        AND column_name = 'created_at'
        AND data_type = 'timestamp without time zone'
    ) THEN
      ALTER TABLE tasks
        ALTER COLUMN created_at TYPE TIMESTAMPTZ
        USING created_at AT TIME ZONE 'UTC';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'tasks'
        AND column_name = 'updated_at'
        AND data_type = 'timestamp without time zone'
    ) THEN
      ALTER TABLE tasks
        ALTER COLUMN updated_at TYPE TIMESTAMPTZ
        USING updated_at AT TIME ZONE 'UTC';
    END IF;
  END IF;
END $$;

COMMIT;
