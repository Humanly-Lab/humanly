-- ============================================================================
-- Issue #93: Lock the model + capability snapshot on an AI chat session so
-- the websocket layer can reject mid-session model switches that drop a
-- modality already used in the conversation history. Without this lock the
-- agent can be silently handed a non-vision model for a session that has
-- image attachments, which fails at the provider with a raw error.
-- ============================================================================

ALTER TABLE ai_chat_sessions
    ADD COLUMN IF NOT EXISTS model_version VARCHAR(200),
    ADD COLUMN IF NOT EXISTS model_capabilities JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN ai_chat_sessions.model_version IS
    'Provider model id (e.g. gpt-4o, moonshotai/Kimi-K2.6) captured at session creation.';
COMMENT ON COLUMN ai_chat_sessions.model_capabilities IS
    'ModelCapabilities JSON snapshot captured at session creation. Compared against the current request''s resolved model to enforce capability gating (#93).';
