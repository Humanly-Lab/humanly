-- OAuth provider accounts linked to Humanly users.
-- Humanly keeps its own JWT/session system; this table only records the
-- external identity that was verified by Google/GitHub.

CREATE TABLE IF NOT EXISTS user_oauth_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(32) NOT NULL,
    provider_user_id VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(provider, provider_user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_oauth_accounts_user_id
    ON user_oauth_accounts(user_id);

CREATE INDEX IF NOT EXISTS idx_user_oauth_accounts_email
    ON user_oauth_accounts(email);

CREATE TRIGGER update_user_oauth_accounts_updated_at
    BEFORE UPDATE ON user_oauth_accounts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
