-- Store task AI settings as first-class fields instead of appending them to description.
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS allowed_llm_models TEXT[] NOT NULL DEFAULT ARRAY['GPT-4o mini']::text[],
  ADD COLUMN IF NOT EXISTS ai_usage_limit INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS start_date TIMESTAMP NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS end_date TIMESTAMP NOT NULL DEFAULT (NOW() + INTERVAL '30 days');

UPDATE tasks
SET allowed_llm_models = regexp_split_to_array(
  trim((regexp_match(description, 'Allowed AI models:[[:space:]]*([^\r\n]+)'))[1]),
  '[[:space:]]*,[[:space:]]*'
)
WHERE description ~ 'Allowed AI models:[[:space:]]*[^\r\n]+';

UPDATE tasks
SET ai_usage_limit = ((regexp_match(description, 'AI usage limit:[[:space:]]*([0-9]+)'))[1])::integer
WHERE description ~ 'AI usage limit:[[:space:]]*[0-9]+';

UPDATE tasks
SET description = NULLIF(
  btrim(
    regexp_replace(
      regexp_replace(description, E'\\n*[[:space:]]*Allowed AI models:[^\\r\\n]*', '', 'g'),
      E'\\n*[[:space:]]*AI usage limit:[^\\r\\n]*',
      '',
      'g'
    )
  ),
  ''
)
WHERE description ~ 'Allowed AI models:|AI usage limit:';
