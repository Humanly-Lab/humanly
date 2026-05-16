-- ============================================================================
-- Issue #110 follow-up: keep a bounded DB fallback copy of uploaded chat images.
-- The storage adapter remains the primary source of bytes, but production can
-- still return a missing object if the runtime storage configuration drifts.
-- Chat uploads are capped at 10 MB by multer, so BYTEA fallback is acceptable
-- for this user-facing attachment path.
-- ============================================================================

ALTER TABLE ai_chat_attachments
    ADD COLUMN IF NOT EXISTS image_bytes BYTEA;
