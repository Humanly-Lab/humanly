-- ============================================================================
-- Issue #93 follow-up: bind chat image storageKeys to their uploader so the
-- websocket layer can refuse a client that supplies somebody else's
-- storageKey. Without this binding any authenticated user that learns or
-- guesses another user's storageKey could have its image bytes inlined
-- into their own chat dispatch.
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_chat_attachments (
    storage_key VARCHAR(512) PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mime_type VARCHAR(100) NOT NULL,
    filename VARCHAR(500),
    size_bytes INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_chat_attachments_user_id ON ai_chat_attachments(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_chat_attachments_created_at ON ai_chat_attachments(created_at DESC);

COMMENT ON TABLE ai_chat_attachments IS
    'Per-user ownership record for chat image attachments uploaded via POST /api/v1/ai/chat/attachments. Inline dispatch refuses any storageKey whose user_id does not match the requesting user.';
