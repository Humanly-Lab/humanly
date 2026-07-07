CREATE TABLE IF NOT EXISTS file_text_indexes (
    file_id UUID PRIMARY KEY REFERENCES files(id) ON DELETE CASCADE,
    status VARCHAR(30) NOT NULL DEFAULT 'pending',
    generation_id UUID NOT NULL DEFAULT uuid_generate_v4(),
    index_version INTEGER NOT NULL DEFAULT 1,
    attempts INTEGER NOT NULL DEFAULT 0,
    page_count INTEGER,
    text_page_count INTEGER NOT NULL DEFAULT 0,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT file_text_indexes_status_check
      CHECK (status IN ('pending', 'processing', 'ready', 'failed', 'unavailable')),
    CONSTRAINT file_text_indexes_attempts_check
      CHECK (attempts >= 0),
    CONSTRAINT file_text_indexes_page_count_check
      CHECK (page_count IS NULL OR page_count >= 0),
    CONSTRAINT file_text_indexes_text_page_count_check
      CHECK (text_page_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_file_text_indexes_status
  ON file_text_indexes(status);

CREATE INDEX IF NOT EXISTS idx_file_text_indexes_generation
  ON file_text_indexes(generation_id);

-- Production-safe backfill only records the lifecycle state that can be
-- derived from existing rows. It intentionally does not reprocess historical
-- PDFs during deployment.
INSERT INTO file_text_indexes (
    file_id,
    status,
    index_version,
    attempts,
    page_count,
    text_page_count,
    started_at,
    completed_at,
    created_at,
    updated_at
)
SELECT
    files.id,
    CASE
      WHEN COUNT(file_pages.id) FILTER (WHERE length(btrim(file_pages.text)) > 0) > 0 THEN 'ready'
      WHEN COUNT(file_pages.id) > 0 THEN 'unavailable'
      ELSE 'pending'
    END AS status,
    1 AS index_version,
    0 AS attempts,
    CASE WHEN COUNT(file_pages.id) > 0 THEN COUNT(file_pages.id)::integer ELSE NULL END AS page_count,
    (COUNT(file_pages.id) FILTER (WHERE length(btrim(file_pages.text)) > 0))::integer AS text_page_count,
    CASE WHEN COUNT(file_pages.id) > 0 THEN NOW() ELSE NULL END AS started_at,
    CASE WHEN COUNT(file_pages.id) > 0 THEN NOW() ELSE NULL END AS completed_at,
    NOW() AS created_at,
    NOW() AS updated_at
FROM files
LEFT JOIN file_pages
  ON file_pages.file_id = files.id
GROUP BY files.id
ON CONFLICT (file_id) DO NOTHING;
