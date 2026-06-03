-- Configurable AI output token budgets (#178).
-- response_max_tokens is used for direct text responses such as quick actions
-- and timeout fallbacks. agent_max_tokens is used for agentic tool-call turns.

ALTER TABLE user_ai_settings
  ADD COLUMN IF NOT EXISTS response_max_tokens INTEGER NOT NULL DEFAULT 1024,
  ADD COLUMN IF NOT EXISTS agent_max_tokens INTEGER NOT NULL DEFAULT 2048;

ALTER TABLE user_ai_settings
  ADD CONSTRAINT user_ai_settings_response_max_tokens_bounds
    CHECK (response_max_tokens BETWEEN 256 AND 16384) NOT VALID,
  ADD CONSTRAINT user_ai_settings_agent_max_tokens_bounds
    CHECK (agent_max_tokens BETWEEN 256 AND 16384) NOT VALID;

ALTER TABLE user_ai_settings
  VALIDATE CONSTRAINT user_ai_settings_response_max_tokens_bounds,
  VALIDATE CONSTRAINT user_ai_settings_agent_max_tokens_bounds;
