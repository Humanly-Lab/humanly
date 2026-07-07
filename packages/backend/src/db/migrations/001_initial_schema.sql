-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "timescaledb";

-- ============================================================================
-- Users table
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email_verified BOOLEAN DEFAULT FALSE,
    email_verification_token VARCHAR(255),
    email_verification_expires TIMESTAMP,
    password_reset_token VARCHAR(255),
    password_reset_expires TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_email_verification_token ON users(email_verification_token) WHERE email_verification_token IS NOT NULL;
CREATE INDEX idx_users_password_reset_token ON users(password_reset_token) WHERE password_reset_token IS NOT NULL;

-- ============================================================================
-- Projects table
-- ============================================================================
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    project_token VARCHAR(64) UNIQUE NOT NULL,
    user_id_key VARCHAR(100) DEFAULT 'userId',
    external_service_type VARCHAR(50),
    external_service_url TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_projects_user_id ON projects(user_id);
CREATE INDEX idx_projects_project_token ON projects(project_token);
CREATE INDEX idx_projects_is_active ON projects(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_projects_created_at ON projects(created_at DESC);

-- ============================================================================
-- Sessions table
-- ============================================================================
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    external_user_id VARCHAR(255) NOT NULL,
    session_start TIMESTAMP NOT NULL DEFAULT NOW(),
    session_end TIMESTAMP,
    submitted BOOLEAN DEFAULT FALSE,
    submission_time TIMESTAMP,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_sessions_project_id ON sessions(project_id);
CREATE INDEX idx_sessions_external_user_id ON sessions(external_user_id);
CREATE INDEX idx_sessions_session_start ON sessions(session_start DESC);
CREATE INDEX idx_sessions_project_user ON sessions(project_id, external_user_id);
CREATE INDEX idx_sessions_submitted ON sessions(submitted);

-- ============================================================================
-- Events table (will be converted to TimescaleDB hypertable)
-- ============================================================================
CREATE TABLE IF NOT EXISTS events (
    id BIGSERIAL,
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    target_element VARCHAR(255),
    key_code VARCHAR(50),
    key_char VARCHAR(10),
    text_before TEXT,
    text_after TEXT,
    cursor_position INTEGER,
    selection_start INTEGER,
    selection_end INTEGER,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Convert events table to TimescaleDB hypertable
-- This enables automatic partitioning by time
SELECT create_hypertable(
    'events',
    'timestamp',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

-- Indexes for events table (optimized for time-series queries)
CREATE INDEX idx_events_session_id_timestamp ON events(session_id, timestamp DESC);
CREATE INDEX idx_events_project_id_timestamp ON events(project_id, timestamp DESC);
CREATE INDEX idx_events_event_type ON events(event_type);
CREATE INDEX idx_events_timestamp ON events(timestamp DESC);
CREATE INDEX idx_events_metadata ON events USING GIN(metadata);

-- ============================================================================
-- Refresh tokens table
-- ============================================================================
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
CREATE INDEX idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);

-- ============================================================================
-- Triggers for updated_at columns
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TimescaleDB policies
-- ============================================================================

-- Compression policy: compress data older than 7 days
-- This significantly reduces storage requirements for old event data
SELECT add_compression_policy('events', INTERVAL '7 days');

-- Retention policy: drop data older than 1 year
-- Adjust this based on your data retention requirements
SELECT add_retention_policy('events', INTERVAL '1 year');

-- ============================================================================
-- Continuous aggregates for analytics (optional, for better performance)
-- ============================================================================

-- Hourly event counts per project
CREATE MATERIALIZED VIEW IF NOT EXISTS events_hourly
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', timestamp) AS hour,
    project_id,
    event_type,
    COUNT(*) AS event_count
FROM events
GROUP BY hour, project_id, event_type
WITH NO DATA;

-- Refresh policy for the continuous aggregate
SELECT add_continuous_aggregate_policy('events_hourly',
    start_offset => INTERVAL '3 hours',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour');

-- Daily session statistics per project
CREATE MATERIALIZED VIEW IF NOT EXISTS session_daily_stats
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 day', session_start) AS day,
    project_id,
    COUNT(DISTINCT id) AS session_count,
    COUNT(DISTINCT external_user_id) AS unique_users,
    COUNT(CASE WHEN submitted THEN 1 END) AS submitted_count,
    AVG(EXTRACT(EPOCH FROM (COALESCE(session_end, NOW()) - session_start))) AS avg_duration_seconds
FROM sessions
GROUP BY day, project_id
WITH NO DATA;

-- Refresh policy for session stats
SELECT add_continuous_aggregate_policy('session_daily_stats',
    start_offset => INTERVAL '3 days',
    end_offset => INTERVAL '1 day',
    schedule_interval => INTERVAL '1 day');

-- ============================================================================
-- Seed data for development (optional)
-- ============================================================================

-- You can add test users and projects here for development
-- Example:
-- INSERT INTO users (email, password_hash, email_verified)
-- VALUES ('test@humanly.dev', '$2b$12$...', TRUE);

-- ============================================================================
-- Views for common queries
-- ============================================================================

-- View for user session summaries
CREATE OR REPLACE VIEW session_summaries AS
SELECT
    s.id,
    s.project_id,
    s.external_user_id,
    s.session_start,
    s.session_end,
    s.submitted,
    EXTRACT(EPOCH FROM (COALESCE(s.session_end, NOW()) - s.session_start)) AS duration_seconds,
    COUNT(e.id) AS event_count,
    MIN(e.timestamp) AS first_event,
    MAX(e.timestamp) AS last_event
FROM sessions s
LEFT JOIN events e ON e.session_id = s.id
GROUP BY s.id;

-- View for project statistics
CREATE OR REPLACE VIEW project_statistics AS
SELECT
    p.id AS project_id,
    p.name AS project_name,
    p.user_id,
    COUNT(DISTINCT s.id) AS total_sessions,
    COUNT(DISTINCT s.external_user_id) AS unique_users,
    COUNT(DISTINCT CASE WHEN s.submitted THEN s.id END) AS submitted_sessions,
    COUNT(e.id) AS total_events,
    MAX(s.session_start) AS last_activity
FROM projects p
LEFT JOIN sessions s ON s.project_id = p.id
LEFT JOIN events e ON e.project_id = p.id
GROUP BY p.id, p.name, p.user_id;

-- ============================================================================
-- Grant permissions (adjust based on your security requirements)
-- ============================================================================

-- In production, you should create specific roles with limited permissions
-- For development, the humanly_user will have full access

-- Example for production:
-- CREATE ROLE humanly_app_role;
-- GRANT CONNECT ON DATABASE humanly_prod TO humanly_app_role;
-- GRANT USAGE ON SCHEMA public TO humanly_app_role;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO humanly_app_role;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO humanly_app_role;
