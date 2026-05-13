-- Migration 005: Peer Review System Schema
-- This migration adds all tables required for the peer review feature

-- Papers submitted for review
CREATE TABLE IF NOT EXISTS papers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    uploaded_by UUID NOT NULL REFERENCES users(id),

    -- Paper metadata (authors hidden from reviewers for blind review)
    title VARCHAR(500) NOT NULL,
    authors TEXT[], -- Array of author names (hidden in API responses to reviewers)
    abstract TEXT,
    keywords TEXT[],
    submission_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- File storage (local)
    pdf_storage_path VARCHAR(500) NOT NULL, -- Local file path
    pdf_file_size INTEGER NOT NULL,
    pdf_page_count INTEGER,
    pdf_checksum VARCHAR(64) NOT NULL, -- SHA-256 hash for integrity

    -- Review metadata
    review_deadline TIMESTAMPTZ,
    status VARCHAR(50) NOT NULL DEFAULT 'pending_review',
    -- Statuses: pending_review, under_review, review_complete, accepted, rejected

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_papers_project FOREIGN KEY (project_id) REFERENCES projects(id),
    CONSTRAINT fk_papers_uploader FOREIGN KEY (uploaded_by) REFERENCES users(id)
);

CREATE INDEX idx_papers_project_id ON papers(project_id);
CREATE INDEX idx_papers_status ON papers(status);
CREATE INDEX idx_papers_submission_date ON papers(submission_date DESC);
CREATE INDEX idx_papers_uploaded_by ON papers(uploaded_by);

-- Reviewer assignments
CREATE TABLE IF NOT EXISTS paper_reviewers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    paper_id UUID NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    reviewer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    assigned_by UUID NOT NULL REFERENCES users(id),
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Reviewer access control
    can_view_paper BOOLEAN NOT NULL DEFAULT TRUE,
    can_write_review BOOLEAN NOT NULL DEFAULT TRUE,
    can_access_ai BOOLEAN NOT NULL DEFAULT TRUE,

    -- Review progress
    review_status VARCHAR(50) NOT NULL DEFAULT 'assigned',
    -- Statuses: assigned, in_progress, submitted
    review_started_at TIMESTAMPTZ,
    review_submitted_at TIMESTAMPTZ,

    -- Reading time tracking
    total_reading_time_seconds INTEGER DEFAULT 0,
    paper_opened_count INTEGER DEFAULT 0,

    UNIQUE(paper_id, reviewer_id),
    CONSTRAINT fk_reviewer_paper FOREIGN KEY (paper_id) REFERENCES papers(id),
    CONSTRAINT fk_reviewer_user FOREIGN KEY (reviewer_id) REFERENCES users(id),
    CONSTRAINT fk_reviewer_assigner FOREIGN KEY (assigned_by) REFERENCES users(id)
);

CREATE INDEX idx_paper_reviewers_paper_id ON paper_reviewers(paper_id);
CREATE INDEX idx_paper_reviewers_reviewer_id ON paper_reviewers(reviewer_id);
CREATE INDEX idx_paper_reviewers_status ON paper_reviewers(review_status);

-- Review documents (follows existing documents table pattern)
CREATE TABLE IF NOT EXISTS reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    paper_id UUID NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    reviewer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    paper_reviewer_id UUID NOT NULL REFERENCES paper_reviewers(id) ON DELETE CASCADE,

    -- Lexical editor content (same as documents)
    content JSONB NOT NULL DEFAULT '{}', -- Lexical state
    plain_text TEXT,
    word_count INTEGER DEFAULT 0,
    character_count INTEGER DEFAULT 0,

    -- Review metadata
    status VARCHAR(50) NOT NULL DEFAULT 'draft',
    -- Statuses: draft, submitted
    version INTEGER NOT NULL DEFAULT 1,

    -- Review scores/ratings (optional structured data)
    scores JSONB, -- { "novelty": 4, "soundness": 5, "clarity": 3, etc. }
    recommendation VARCHAR(50), -- accept, reject, revise, etc.
    confidence_level INTEGER, -- 1-5 scale

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    submitted_at TIMESTAMPTZ,

    CONSTRAINT fk_reviews_paper FOREIGN KEY (paper_id) REFERENCES papers(id),
    CONSTRAINT fk_reviews_reviewer FOREIGN KEY (reviewer_id) REFERENCES users(id),
    CONSTRAINT fk_reviews_paper_reviewer FOREIGN KEY (paper_reviewer_id) REFERENCES paper_reviewers(id)
);

CREATE INDEX idx_reviews_paper_id ON reviews(paper_id);
CREATE INDEX idx_reviews_reviewer_id ON reviews(reviewer_id);
CREATE INDEX idx_reviews_status ON reviews(status);
CREATE INDEX idx_reviews_plain_text ON reviews USING gin(to_tsvector('english', plain_text));

-- Trigger for updating updated_at timestamp
CREATE OR REPLACE FUNCTION update_reviews_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER reviews_updated_at
    BEFORE UPDATE ON reviews
    FOR EACH ROW
    EXECUTE FUNCTION update_reviews_updated_at();

-- Review events (TimescaleDB hypertable for keystroke tracking)
CREATE TABLE IF NOT EXISTS review_events (
    id UUID DEFAULT gen_random_uuid(),
    review_id UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
    reviewer_id UUID NOT NULL REFERENCES users(id),

    -- Event data (same pattern as document_events)
    event_type VARCHAR(50) NOT NULL,
    event_data JSONB NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Context
    selection_text TEXT,
    cursor_position INTEGER,

    CONSTRAINT fk_review_events_review FOREIGN KEY (review_id) REFERENCES reviews(id),
    CONSTRAINT fk_review_events_reviewer FOREIGN KEY (reviewer_id) REFERENCES users(id)
);

-- Convert to TimescaleDB hypertable (partitioned by time)
SELECT create_hypertable('review_events', 'timestamp',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

CREATE INDEX idx_review_events_review_id ON review_events(review_id, timestamp DESC);
CREATE INDEX idx_review_events_reviewer_id ON review_events(reviewer_id, timestamp DESC);

-- Review comments (for inline paper annotations)
CREATE TABLE IF NOT EXISTS review_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_id UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
    reviewer_id UUID NOT NULL REFERENCES users(id),
    paper_id UUID NOT NULL REFERENCES papers(id),

    -- PDF location
    page_number INTEGER NOT NULL,
    position_x FLOAT, -- Relative position on page (0-1)
    position_y FLOAT,
    selected_text TEXT, -- Text that was highlighted

    -- Comment content
    comment_text TEXT NOT NULL,
    comment_type VARCHAR(50), -- question, suggestion, error, praise, etc.

    -- Status
    is_resolved BOOLEAN DEFAULT FALSE,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_review_comments_review FOREIGN KEY (review_id) REFERENCES reviews(id),
    CONSTRAINT fk_review_comments_reviewer FOREIGN KEY (reviewer_id) REFERENCES users(id),
    CONSTRAINT fk_review_comments_paper FOREIGN KEY (paper_id) REFERENCES papers(id)
);

CREATE INDEX idx_review_comments_review_id ON review_comments(review_id);
CREATE INDEX idx_review_comments_paper_id ON review_comments(paper_id, page_number);

-- AI interactions for reviews (extends existing ai_chat_sessions pattern)
CREATE TABLE IF NOT EXISTS review_ai_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_id UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
    reviewer_id UUID NOT NULL REFERENCES users(id),
    paper_id UUID NOT NULL REFERENCES papers(id),

    -- Session metadata
    session_name VARCHAR(200),
    context_snapshot JSONB, -- Paper excerpt + review draft state

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_review_ai_review FOREIGN KEY (review_id) REFERENCES reviews(id),
    CONSTRAINT fk_review_ai_reviewer FOREIGN KEY (reviewer_id) REFERENCES users(id),
    CONSTRAINT fk_review_ai_paper FOREIGN KEY (paper_id) REFERENCES papers(id)
);

CREATE INDEX idx_review_ai_sessions_review_id ON review_ai_sessions(review_id);

CREATE TABLE IF NOT EXISTS review_ai_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES review_ai_sessions(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL, -- 'user', 'assistant', 'system'
    content TEXT NOT NULL,

    -- Message metadata
    paper_excerpt TEXT, -- Relevant paper section being discussed
    review_excerpt TEXT, -- Relevant review section being discussed

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_review_ai_messages_session FOREIGN KEY (session_id) REFERENCES review_ai_sessions(id)
);

CREATE INDEX idx_review_ai_messages_session_id ON review_ai_messages(session_id, created_at);

CREATE TABLE IF NOT EXISTS review_ai_interaction_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES review_ai_sessions(id) ON DELETE SET NULL,
    review_id UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
    reviewer_id UUID NOT NULL REFERENCES users(id),

    -- Query details
    query_type VARCHAR(50) NOT NULL,
    -- Types: fact_check, logic_check, citation_check, clarification,
    --        summarize_section, compare_claims, etc.
    query_text TEXT NOT NULL,
    response_text TEXT NOT NULL,

    -- Performance metrics
    response_time_ms INTEGER,
    tokens_used INTEGER,
    model_used VARCHAR(100),

    -- Context
    paper_context TEXT, -- What part of paper was being discussed
    review_context TEXT, -- What part of review was being written

    -- User feedback
    suggestion_applied BOOLEAN DEFAULT FALSE,
    user_modified_text TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_review_ai_logs_session FOREIGN KEY (session_id) REFERENCES review_ai_sessions(id),
    CONSTRAINT fk_review_ai_logs_review FOREIGN KEY (review_id) REFERENCES reviews(id),
    CONSTRAINT fk_review_ai_logs_reviewer FOREIGN KEY (reviewer_id) REFERENCES users(id)
);

CREATE INDEX idx_review_ai_logs_review_id ON review_ai_interaction_logs(review_id, created_at DESC);
CREATE INDEX idx_review_ai_logs_query_type ON review_ai_interaction_logs(query_type);

-- Recording sessions (screen/camera) with 24-hour retention
CREATE TABLE IF NOT EXISTS review_recordings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    paper_reviewer_id UUID NOT NULL REFERENCES paper_reviewers(id) ON DELETE CASCADE,
    review_id UUID REFERENCES reviews(id) ON DELETE SET NULL,
    reviewer_id UUID NOT NULL REFERENCES users(id),
    paper_id UUID NOT NULL REFERENCES papers(id),

    -- Recording type
    recording_type VARCHAR(50) NOT NULL, -- 'screen', 'camera', 'both'

    -- Consent
    consent_given BOOLEAN NOT NULL DEFAULT FALSE,
    consent_timestamp TIMESTAMPTZ,

    -- Recording metadata
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    duration_seconds INTEGER,

    -- Storage (local path)
    storage_path VARCHAR(500), -- Local file path
    file_size INTEGER,
    format VARCHAR(50), -- 'webm', 'mp4', etc.

    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'recording',
    -- Statuses: recording, stopped, processing, available, failed, deleted

    -- 24-hour retention tracking
    expires_at TIMESTAMPTZ, -- Automatically set to started_at + 24 hours

    CONSTRAINT fk_review_recordings_paper_reviewer FOREIGN KEY (paper_reviewer_id) REFERENCES paper_reviewers(id),
    CONSTRAINT fk_review_recordings_review FOREIGN KEY (review_id) REFERENCES reviews(id),
    CONSTRAINT fk_review_recordings_reviewer FOREIGN KEY (reviewer_id) REFERENCES users(id),
    CONSTRAINT fk_review_recordings_paper FOREIGN KEY (paper_id) REFERENCES papers(id)
);

CREATE INDEX idx_review_recordings_paper_reviewer_id ON review_recordings(paper_reviewer_id);
CREATE INDEX idx_review_recordings_review_id ON review_recordings(review_id);
CREATE INDEX idx_review_recordings_expires_at ON review_recordings(expires_at) WHERE status != 'deleted';

-- Trigger to automatically set expires_at to 24 hours after started_at
CREATE OR REPLACE FUNCTION set_recording_expiry()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.started_at IS NOT NULL AND NEW.expires_at IS NULL THEN
        NEW.expires_at = NEW.started_at + INTERVAL '24 hours';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER review_recordings_set_expiry
    BEFORE INSERT OR UPDATE ON review_recordings
    FOR EACH ROW
    EXECUTE FUNCTION set_recording_expiry();

-- Paper access logs (track every time paper is viewed)
CREATE TABLE IF NOT EXISTS paper_access_logs (
    id UUID DEFAULT gen_random_uuid(),
    paper_id UUID NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    reviewer_id UUID NOT NULL REFERENCES users(id),

    -- Access details
    access_type VARCHAR(50) NOT NULL, -- 'open', 'page_view', 'zoom', 'search', 'close'
    page_number INTEGER,
    duration_seconds INTEGER, -- Time spent on this page

    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_paper_access_paper FOREIGN KEY (paper_id) REFERENCES papers(id),
    CONSTRAINT fk_paper_access_reviewer FOREIGN KEY (reviewer_id) REFERENCES users(id)
);

-- Convert to TimescaleDB hypertable
SELECT create_hypertable('paper_access_logs', 'timestamp',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

CREATE INDEX idx_paper_access_logs_paper_id ON paper_access_logs(paper_id, timestamp DESC);
CREATE INDEX idx_paper_access_logs_reviewer_id ON paper_access_logs(reviewer_id, timestamp DESC);

-- Trigger for updating updated_at on papers
CREATE OR REPLACE FUNCTION update_papers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER papers_updated_at
    BEFORE UPDATE ON papers
    FOR EACH ROW
    EXECUTE FUNCTION update_papers_updated_at();
