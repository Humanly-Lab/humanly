-- ============================================================================
-- Issue #110: chat image uploads can be stored in the active file-storage
-- provider (for example GCS in production), but dispatch previously reloaded
-- them by bare storage_key, which defaults to local storage. Persist the
-- provider locator alongside the ownership row so image inlining reads from
-- the same backend that accepted the upload.
-- ============================================================================

ALTER TABLE ai_chat_attachments
    ADD COLUMN IF NOT EXISTS storage_provider VARCHAR(20) NOT NULL DEFAULT 'local';

ALTER TABLE ai_chat_attachments
    ADD COLUMN IF NOT EXISTS storage_bucket VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_ai_chat_attachments_storage_provider
    ON ai_chat_attachments(storage_provider);
