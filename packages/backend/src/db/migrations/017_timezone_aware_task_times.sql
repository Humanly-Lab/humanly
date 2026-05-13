DO $$
BEGIN
  IF to_regclass('public.tasks') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'tasks'
        AND column_name = 'start_date'
        AND data_type = 'timestamp without time zone'
    ) THEN
      ALTER TABLE tasks
        ALTER COLUMN start_date TYPE TIMESTAMPTZ
        USING start_date AT TIME ZONE current_setting('TimeZone');
    END IF;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'tasks'
        AND column_name = 'end_date'
        AND data_type = 'timestamp without time zone'
    ) THEN
      ALTER TABLE tasks
        ALTER COLUMN end_date TYPE TIMESTAMPTZ
        USING end_date AT TIME ZONE current_setting('TimeZone');
    END IF;
  END IF;

  IF to_regclass('public.task_enrollments') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'task_enrollments'
        AND column_name = 'joined_at'
        AND data_type = 'timestamp without time zone'
    ) THEN
      ALTER TABLE task_enrollments
        ALTER COLUMN joined_at TYPE TIMESTAMPTZ
        USING joined_at AT TIME ZONE current_setting('TimeZone');
    END IF;
  END IF;

  IF to_regclass('public.submissions') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'submissions'
        AND column_name = 'submitted_at'
        AND data_type = 'timestamp without time zone'
    ) THEN
      ALTER TABLE submissions
        ALTER COLUMN submitted_at TYPE TIMESTAMPTZ
        USING submitted_at AT TIME ZONE current_setting('TimeZone');
    END IF;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'submissions'
        AND column_name = 'created_at'
        AND data_type = 'timestamp without time zone'
    ) THEN
      ALTER TABLE submissions
        ALTER COLUMN created_at TYPE TIMESTAMPTZ
        USING created_at AT TIME ZONE current_setting('TimeZone');
    END IF;
  END IF;

  IF to_regclass('public.certificates') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'certificates'
        AND column_name = 'generated_at'
        AND data_type = 'timestamp without time zone'
    ) THEN
      ALTER TABLE certificates
        ALTER COLUMN generated_at TYPE TIMESTAMPTZ
        USING generated_at AT TIME ZONE current_setting('TimeZone');
    END IF;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'certificates'
        AND column_name = 'created_at'
        AND data_type = 'timestamp without time zone'
    ) THEN
      ALTER TABLE certificates
        ALTER COLUMN created_at TYPE TIMESTAMPTZ
        USING created_at AT TIME ZONE current_setting('TimeZone');
    END IF;
  END IF;
END $$;
