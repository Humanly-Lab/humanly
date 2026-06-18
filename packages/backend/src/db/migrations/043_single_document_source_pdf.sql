-- Enforce the product rule that personal documents have a single source PDF.
-- Task instruction PDFs are intentionally unaffected; they use task_id with
-- purpose = 'task_instruction_pdf' and may include multiple files.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM files
    WHERE purpose = 'document_source_pdf'
      AND document_id IS NOT NULL
    GROUP BY document_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce single document source PDF: duplicate document_source_pdf records exist';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_files_single_document_source_pdf
  ON files(document_id)
  WHERE purpose = 'document_source_pdf'
    AND document_id IS NOT NULL;
