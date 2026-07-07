-- ============================================================================
-- Documents table - User-created documents with Lexical editor state
-- ============================================================================
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    content JSONB NOT NULL DEFAULT '{}'::jsonb,
    plain_text TEXT DEFAULT '',
    status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
    version INTEGER DEFAULT 1,
    word_count INTEGER DEFAULT 0,
    character_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    last_edited_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_documents_user_id ON documents(user_id);
CREATE INDEX idx_documents_status ON documents(status);
CREATE INDEX idx_documents_created_at ON documents(created_at DESC);
CREATE INDEX idx_documents_updated_at ON documents(updated_at DESC);
CREATE INDEX idx_documents_last_edited_at ON documents(last_edited_at DESC);
CREATE INDEX idx_documents_user_status ON documents(user_id, status);
-- Full-text search index on plain_text
CREATE INDEX idx_documents_plain_text_search ON documents USING GIN(to_tsvector('english', plain_text));

-- ============================================================================
-- Document events table - Keystroke tracking for documents
-- Separate from external form events due to different context and retention
-- ============================================================================
CREATE TABLE IF NOT EXISTS document_events (
    id BIGSERIAL,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    key_code VARCHAR(50),
    key_char VARCHAR(10),
    text_before TEXT,
    text_after TEXT,
    cursor_position INTEGER,
    selection_start INTEGER,
    selection_end INTEGER,
    editor_state_before JSONB,
    editor_state_after JSONB,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Convert to TimescaleDB hypertable for time-series optimization
SELECT create_hypertable(
    'document_events',
    'timestamp',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

-- Indexes for document_events
CREATE INDEX idx_document_events_document_id_timestamp ON document_events(document_id, timestamp DESC);
CREATE INDEX idx_document_events_user_id_timestamp ON document_events(user_id, timestamp DESC);
CREATE INDEX idx_document_events_event_type ON document_events(event_type);
CREATE INDEX idx_document_events_timestamp ON document_events(timestamp DESC);

-- Compression policy (compress chunks older than 7 days)
SELECT add_compression_policy('document_events', INTERVAL '7 days', if_not_exists => TRUE);

-- ============================================================================
-- Certificates table - Generated authorship certificates
-- ============================================================================
CREATE TABLE IF NOT EXISTS certificates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    certificate_type VARCHAR(50) DEFAULT 'full_authorship' CHECK (certificate_type IN ('full_authorship', 'partial_authorship')),

    -- Certificate data
    title VARCHAR(500) NOT NULL,
    document_snapshot JSONB NOT NULL,
    plain_text_snapshot TEXT NOT NULL,

    -- Statistics
    total_events INTEGER NOT NULL,
    typing_events INTEGER NOT NULL,
    paste_events INTEGER NOT NULL,
    total_characters INTEGER NOT NULL,
    typed_characters INTEGER NOT NULL,
    pasted_characters INTEGER NOT NULL,
    editing_time_seconds INTEGER NOT NULL,

    -- Verification
    signature TEXT NOT NULL,
    verification_token VARCHAR(255) UNIQUE NOT NULL,

    -- Metadata
    generated_at TIMESTAMP DEFAULT NOW(),
    pdf_generated BOOLEAN DEFAULT FALSE,
    pdf_url TEXT,
    json_url TEXT,

    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_certificates_document_id ON certificates(document_id);
CREATE INDEX idx_certificates_user_id ON certificates(user_id);
CREATE INDEX idx_certificates_verification_token ON certificates(verification_token);
CREATE INDEX idx_certificates_created_at ON certificates(created_at DESC);
CREATE INDEX idx_certificates_generated_at ON certificates(generated_at DESC);

-- ============================================================================
-- Triggers
-- ============================================================================

-- Trigger to update updated_at timestamp on documents
CREATE OR REPLACE FUNCTION update_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    NEW.last_edited_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_documents_updated_at
    BEFORE UPDATE ON documents
    FOR EACH ROW
    EXECUTE FUNCTION update_documents_updated_at();

-- ============================================================================
-- Views
-- ============================================================================

-- Document statistics view
CREATE OR REPLACE VIEW document_statistics AS
SELECT
    d.id AS document_id,
    d.user_id,
    d.title,
    d.status,
    d.word_count,
    d.character_count,
    COUNT(de.id) AS total_events,
    COUNT(CASE WHEN de.event_type IN ('keydown', 'keyup') THEN 1 END) AS typing_events,
    COUNT(CASE WHEN de.event_type = 'paste' THEN 1 END) AS paste_events,
    MIN(de.timestamp) AS first_event,
    MAX(de.timestamp) AS last_event,
    COALESCE(EXTRACT(EPOCH FROM (MAX(de.timestamp) - MIN(de.timestamp))), 0) AS editing_duration_seconds
FROM documents d
LEFT JOIN document_events de ON de.document_id = d.id
GROUP BY d.id, d.user_id, d.title, d.status, d.word_count, d.character_count;

-- User certificate summary view
CREATE OR REPLACE VIEW user_certificate_summary AS
SELECT
    u.id AS user_id,
    u.email,
    COUNT(c.id) AS total_certificates,
    COUNT(DISTINCT c.document_id) AS certified_documents,
    MAX(c.created_at) AS last_certificate_date
FROM users u
LEFT JOIN certificates c ON c.user_id = u.id
GROUP BY u.id, u.email;

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE documents IS 'User-created documents with Lexical editor state';
COMMENT ON TABLE document_events IS 'Keystroke tracking events for documents (TimescaleDB hypertable)';
COMMENT ON TABLE certificates IS 'Generated authorship certificates with JWT signatures';
COMMENT ON COLUMN documents.content IS 'Lexical editor state stored as JSONB';
COMMENT ON COLUMN documents.plain_text IS 'Plain text extraction for search and word counting';
COMMENT ON COLUMN document_events.editor_state_before IS 'Full Lexical editor state snapshot before change';
COMMENT ON COLUMN document_events.editor_state_after IS 'Full Lexical editor state snapshot after change';
COMMENT ON COLUMN certificates.signature IS 'JWT signature for certificate verification';
COMMENT ON COLUMN certificates.verification_token IS 'Public token for certificate verification';
