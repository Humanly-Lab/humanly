-- Rename token budget settings from provider-centric response/agent wording
-- to product-facing shortcut/chat wording (#180).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'user_ai_settings'
      AND column_name = 'response_max_tokens'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'user_ai_settings'
      AND column_name = 'shortcut_max_tokens'
  ) THEN
    ALTER TABLE user_ai_settings
      RENAME COLUMN response_max_tokens TO shortcut_max_tokens;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'user_ai_settings'
      AND column_name = 'agent_max_tokens'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'user_ai_settings'
      AND column_name = 'chat_max_tokens'
  ) THEN
    ALTER TABLE user_ai_settings
      RENAME COLUMN agent_max_tokens TO chat_max_tokens;
  END IF;
END $$;

ALTER TABLE user_ai_settings
  ADD COLUMN IF NOT EXISTS shortcut_max_tokens INTEGER NOT NULL DEFAULT 1024,
  ADD COLUMN IF NOT EXISTS chat_max_tokens INTEGER NOT NULL DEFAULT 4096;

ALTER TABLE user_ai_settings
  ALTER COLUMN shortcut_max_tokens SET DEFAULT 1024,
  ALTER COLUMN chat_max_tokens SET DEFAULT 4096;

-- The previous chat default was 2048. Bump rows still carrying that default
-- so existing users inherit the safer reasoning-model budget unless they later
-- choose a smaller value explicitly.
UPDATE user_ai_settings
SET chat_max_tokens = 4096
WHERE chat_max_tokens = 2048;

UPDATE tasks
SET environment_config = (
  jsonb_set(
    jsonb_set(
      environment_config,
      '{aiTokenBudget,shortcutMaxTokens}',
      COALESCE(
        environment_config #> '{aiTokenBudget,shortcutMaxTokens}',
        environment_config #> '{aiTokenBudget,responseMaxTokens}',
        '1024'::jsonb
      ),
      true
    ),
    '{aiTokenBudget,chatMaxTokens}',
    COALESCE(
      environment_config #> '{aiTokenBudget,chatMaxTokens}',
      CASE
        WHEN environment_config #>> '{aiTokenBudget,agentMaxTokens}' = '2048' THEN '4096'::jsonb
        ELSE environment_config #> '{aiTokenBudget,agentMaxTokens}'
      END,
      '4096'::jsonb
    ),
    true
  ) #- '{aiTokenBudget,responseMaxTokens}' #- '{aiTokenBudget,agentMaxTokens}'
)
WHERE environment_config IS NOT NULL
  AND environment_config ? 'aiTokenBudget'
  AND (
    environment_config #> '{aiTokenBudget,responseMaxTokens}' IS NOT NULL
    OR environment_config #> '{aiTokenBudget,agentMaxTokens}' IS NOT NULL
  );

UPDATE documents
SET environment_config = (
  jsonb_set(
    jsonb_set(
      environment_config,
      '{aiTokenBudget,shortcutMaxTokens}',
      COALESCE(
        environment_config #> '{aiTokenBudget,shortcutMaxTokens}',
        environment_config #> '{aiTokenBudget,responseMaxTokens}',
        '1024'::jsonb
      ),
      true
    ),
    '{aiTokenBudget,chatMaxTokens}',
    COALESCE(
      environment_config #> '{aiTokenBudget,chatMaxTokens}',
      CASE
        WHEN environment_config #>> '{aiTokenBudget,agentMaxTokens}' = '2048' THEN '4096'::jsonb
        ELSE environment_config #> '{aiTokenBudget,agentMaxTokens}'
      END,
      '4096'::jsonb
    ),
    true
  ) #- '{aiTokenBudget,responseMaxTokens}' #- '{aiTokenBudget,agentMaxTokens}'
)
WHERE environment_config IS NOT NULL
  AND environment_config ? 'aiTokenBudget'
  AND (
    environment_config #> '{aiTokenBudget,responseMaxTokens}' IS NOT NULL
    OR environment_config #> '{aiTokenBudget,agentMaxTokens}' IS NOT NULL
  );

ALTER TABLE user_ai_settings
  DROP CONSTRAINT IF EXISTS user_ai_settings_response_max_tokens_bounds,
  DROP CONSTRAINT IF EXISTS user_ai_settings_agent_max_tokens_bounds,
  DROP CONSTRAINT IF EXISTS user_ai_settings_shortcut_max_tokens_bounds,
  DROP CONSTRAINT IF EXISTS user_ai_settings_chat_max_tokens_bounds;

ALTER TABLE user_ai_settings
  ADD CONSTRAINT user_ai_settings_shortcut_max_tokens_bounds
    CHECK (shortcut_max_tokens BETWEEN 256 AND 16384) NOT VALID,
  ADD CONSTRAINT user_ai_settings_chat_max_tokens_bounds
    CHECK (chat_max_tokens BETWEEN 256 AND 16384) NOT VALID;

ALTER TABLE user_ai_settings
  VALIDATE CONSTRAINT user_ai_settings_shortcut_max_tokens_bounds,
  VALIDATE CONSTRAINT user_ai_settings_chat_max_tokens_bounds;
