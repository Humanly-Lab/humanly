#!/bin/bash
# Run pending production SQL migrations through the postgres Compose service.
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-packages/backend/src/db/migrations}"
POSTGRES_SERVICE="${POSTGRES_SERVICE:-postgres}"
POSTGRES_DB="${POSTGRES_DB:-humanly_prod}"
POSTGRES_USER="${POSTGRES_USER:-humanly_user}"
BASELINE_EXISTING_DB="${BASELINE_EXISTING_DB:-true}"

if [[ ! -d "$MIGRATIONS_DIR" ]]; then
  echo "ERROR: Migration directory not found: $MIGRATIONS_DIR" >&2
  exit 1
fi

checksum_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

psql_exec() {
  docker compose -f "$COMPOSE_FILE" exec -T -e PAGER=cat "$POSTGRES_SERVICE" \
    psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"
}

psql_scalar() {
  psql_exec -At "$@"
}

legacy_review_tables_retired() {
  psql_scalar -c "SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE filename = '022_drop_legacy_review_tables.sql') OR (
    to_regclass('public.papers') IS NULL
    AND to_regclass('public.reviews') IS NULL
    AND to_regclass('public.paper_pages') IS NULL
    AND to_regclass('public.paper_text_chunks') IS NULL
  );"
}

migration_presence() {
  local filename="$1"

  case "$filename" in
    006-paper-document-link.sql)
      if [[ "$(legacy_review_tables_retired)" == "t" ]]; then
        echo "t"
      else
        psql_scalar -c "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'papers' AND column_name = 'document_id');"
      fi
      ;;
    007_ai_authorship_statistics.sql)
      psql_scalar -c "SELECT to_regclass('public.ai_selection_actions') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ai_interaction_logs' AND column_name = 'question_category');"
      ;;
    008_user_ai_settings.sql)
      psql_scalar -c "SELECT to_regclass('public.user_ai_settings') IS NOT NULL;"
      ;;
    010_paper_text_retrieval.sql)
      if [[ "$(legacy_review_tables_retired)" == "t" ]]; then
        echo "t"
      else
        psql_scalar -c "SELECT to_regclass('public.paper_pages') IS NOT NULL AND to_regclass('public.paper_sections') IS NOT NULL AND to_regclass('public.paper_text_chunks') IS NOT NULL;"
      fi
      ;;
    011_user_roles.sql)
      psql_scalar -c "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'role');"
      ;;
    012_task_enrollments.sql)
      psql_scalar -c "SELECT to_regclass('public.task_enrollments') IS NOT NULL;"
      ;;
    013_task_enrollment_submission_document.sql)
      psql_scalar -c "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'task_enrollments' AND column_name = 'submission_document_id');"
      ;;
    014_document_events_session_id.sql)
      psql_scalar -c "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'document_events' AND column_name = 'session_id');"
      ;;
    015_task_ai_settings.sql)
      psql_scalar -c "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'allowed_llm_models') AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'ai_usage_limit');"
      ;;
    016_task_submissions.sql)
      psql_scalar -c "SELECT to_regclass('public.submissions') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'certificates' AND column_name = 'submission_id');"
      ;;
    017_timezone_aware_task_times.sql)
      psql_scalar -c "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'start_date' AND data_type = 'timestamp with time zone') AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'end_date' AND data_type = 'timestamp with time zone');"
      ;;
    018_writing_environment_config.sql)
      psql_scalar -c "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'environment_config') AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'documents' AND column_name = 'environment_config');"
      ;;
    019_document_description.sql)
      psql_scalar -c "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'documents' AND column_name = 'description');"
      ;;
    020_unified_files.sql)
      psql_scalar -c "SELECT to_regclass('public.files') IS NOT NULL AND to_regclass('public.file_pages') IS NOT NULL AND to_regclass('public.file_sections') IS NOT NULL AND to_regclass('public.file_text_chunks') IS NOT NULL;"
      ;;
    021_gcs_file_storage.sql)
      psql_scalar -c "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'files' AND column_name = 'storage_bucket') AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'files' AND column_name = 'storage_etag') AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'files' AND column_name = 'upload_status');"
      ;;
    022_drop_legacy_review_tables.sql)
      legacy_review_tables_retired
      ;;
    023_ai_chat_session_capabilities.sql)
      psql_scalar -c "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ai_chat_sessions' AND column_name = 'model_version') AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ai_chat_sessions' AND column_name = 'model_capabilities');"
      ;;
    024_chat_image_attachments_ownership.sql)
      psql_scalar -c "SELECT to_regclass('public.ai_chat_attachments') IS NOT NULL;"
      ;;
    025_chat_image_attachment_storage_locator.sql)
      psql_scalar -c "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ai_chat_attachments' AND column_name = 'storage_provider') AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ai_chat_attachments' AND column_name = 'storage_bucket');"
      ;;
    026_chat_image_attachment_db_fallback.sql)
      psql_scalar -c "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ai_chat_attachments' AND column_name = 'image_bytes');"
      ;;
    027_analytics_query_indexes.sql)
      psql_scalar -c "SELECT to_regclass('public.idx_sessions_task_user_start') IS NOT NULL AND to_regclass('public.idx_sessions_task_start') IS NOT NULL AND to_regclass('public.idx_document_events_session_timestamp') IS NOT NULL AND to_regclass('public.idx_document_events_unlinked_doc_user_created') IS NOT NULL AND to_regclass('public.idx_task_enrollments_task_user') IS NOT NULL AND to_regclass('public.idx_submissions_task_submitted_at') IS NOT NULL;"
      ;;
    028_user_ai_token_budget.sql)
      psql_scalar -c "SELECT (
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_ai_settings' AND column_name = 'response_max_tokens')
        AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_ai_settings' AND column_name = 'agent_max_tokens')
      ) OR (
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_ai_settings' AND column_name = 'shortcut_max_tokens')
        AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_ai_settings' AND column_name = 'chat_max_tokens')
      );"
      ;;
    029_rename_ai_token_budget_columns.sql)
      psql_scalar -c "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_ai_settings' AND column_name = 'shortcut_max_tokens') AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_ai_settings' AND column_name = 'chat_max_tokens');"
      ;;
    030_document_writing_timer.sql)
      psql_scalar -c "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'documents' AND column_name = 'writing_started_at');"
      ;;
    031_task_auto_submit_tracking.sql)
      psql_scalar -c "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'task_enrollments' AND column_name = 'auto_submit_claimed_at') AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'task_enrollments' AND column_name = 'auto_submit_completed_at') AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'task_enrollments' AND column_name = 'auto_submit_error');"
      ;;
    *)
      echo "unknown"
      ;;
  esac
}

delete_migration_record() {
  local filename="$1"
  psql_exec -v filename="$filename" <<'SQL'
DELETE FROM schema_migrations
WHERE filename = :'filename';
SQL
}

echo "==> Preparing schema_migrations table"
psql_exec <<'SQL'
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename TEXT PRIMARY KEY,
  checksum TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  execution_seconds NUMERIC,
  baseline BOOLEAN NOT NULL DEFAULT FALSE
);
SQL

migration_files=()
while IFS= read -r file; do
  migration_files+=("$file")
done < <(find "$MIGRATIONS_DIR" -maxdepth 1 -type f -name '*.sql' | sort)

if [[ "${#migration_files[@]}" -eq 0 ]]; then
  echo "==> No migration files found"
  exit 0
fi

applied_count="$(psql_scalar -c 'SELECT COUNT(*) FROM schema_migrations;')"
users_table_exists="$(psql_scalar -c "SELECT to_regclass('public.users') IS NOT NULL;")"

if [[ "$applied_count" == "0" && "$BASELINE_EXISTING_DB" == "true" && "$users_table_exists" == "t" ]]; then
  echo "==> Existing database detected with no migration history"
  echo "==> Baselining migration files that are already present in the schema"

  for file in "${migration_files[@]}"; do
    filename="$(basename "$file")"
    checksum="$(checksum_file "$file")"
    presence="$(migration_presence "$filename")"

    if [[ "$presence" == "f" ]]; then
      echo "    will apply missing migration $filename"
      continue
    fi

    psql_exec -v filename="$filename" -v checksum="$checksum" <<'SQL'
INSERT INTO schema_migrations (filename, checksum, execution_seconds, baseline)
VALUES (:'filename', :'checksum', 0, TRUE)
ON CONFLICT (filename) DO NOTHING;
SQL
    echo "    baselined $filename"
  done

  echo "==> Baseline complete; pending missing migrations will run now"
fi

echo "==> Checking recorded migrations against live schema"
for file in "${migration_files[@]}"; do
  filename="$(basename "$file")"
  recorded="$(psql_scalar -c "SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE filename = '$filename');")"
  if [[ "$recorded" != "t" ]]; then
    continue
  fi

  presence="$(migration_presence "$filename")"
  if [[ "$presence" == "f" ]]; then
    echo "    repair history for missing migration $filename"
    delete_migration_record "$filename"
  fi
done

echo "==> Running pending migrations"
pending_count=0

for file in "${migration_files[@]}"; do
  filename="$(basename "$file")"
  checksum="$(checksum_file "$file")"
  existing_checksum="$(psql_scalar -c "SELECT checksum FROM schema_migrations WHERE filename = '$filename';")"

  if [[ -n "$existing_checksum" ]]; then
    if [[ "$existing_checksum" != "$checksum" ]]; then
      echo "ERROR: Migration checksum changed after it was applied: $filename" >&2
      echo "       applied: $existing_checksum" >&2
      echo "       current: $checksum" >&2
      exit 1
    fi
    echo "    skip $filename"
    continue
  fi

  echo "    apply $filename"
  start_time="$(date +%s)"
  psql_exec < "$file"
  end_time="$(date +%s)"
  duration="$((end_time - start_time))"

  psql_exec -v filename="$filename" -v checksum="$checksum" -v duration="$duration" <<'SQL'
INSERT INTO schema_migrations (filename, checksum, execution_seconds, baseline)
VALUES (:'filename', :'checksum', :'duration', FALSE);
SQL

  pending_count="$((pending_count + 1))"
done

echo "==> Migration complete (${pending_count} applied)"
