-- Clean historical duplicate personal Document source PDFs before enforcing
-- the single-source-PDF unique index in 043_single_document_source_pdf.sql.
--
-- Product rule:
-- - document_source_pdf: one PDF per Document.
-- - task_instruction_pdf: unchanged; tasks may still have multiple PDFs.
--
-- The files table owns derived text-index rows through ON DELETE CASCADE, so
-- deleting duplicate file rows also removes their file_pages/file_sections/
-- file_text_chunks rows. Physical storage objects are intentionally left in
-- place for a separate orphan-cleanup job.

DO $$
DECLARE
  deleted_count INTEGER := 0;
BEGIN
  WITH ranked_document_files AS (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY document_id
        ORDER BY created_at DESC NULLS LAST, id DESC
      ) AS row_number
    FROM files
    WHERE purpose = 'document_source_pdf'
      AND document_id IS NOT NULL
  ),
  deleted_files AS (
    DELETE FROM files
    USING ranked_document_files
    WHERE files.id = ranked_document_files.id
      AND ranked_document_files.row_number > 1
    RETURNING files.id
  )
  SELECT COUNT(*) INTO deleted_count
  FROM deleted_files;

  RAISE NOTICE 'Deleted % historical duplicate document_source_pdf file rows', deleted_count;
END $$;
