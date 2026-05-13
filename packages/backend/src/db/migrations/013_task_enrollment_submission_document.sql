-- Link a user portal task enrollment to the submission document created for it.

ALTER TABLE task_enrollments
    ADD COLUMN IF NOT EXISTS submission_document_id UUID REFERENCES documents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_task_enrollments_submission_document_id
    ON task_enrollments(submission_document_id)
    WHERE submission_document_id IS NOT NULL;
