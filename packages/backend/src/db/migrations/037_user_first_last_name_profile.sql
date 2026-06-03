-- Store structured account names while preserving the legacy display-name field.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS first_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS last_name VARCHAR(100);

UPDATE users
SET name = NULLIF(BTRIM(name), '')
WHERE name IS NOT NULL;

UPDATE users
SET
  first_name = COALESCE(
    NULLIF(BTRIM(first_name), ''),
    NULLIF(SPLIT_PART(BTRIM(name), ' ', 1), '')
  ),
  last_name = COALESCE(
    NULLIF(BTRIM(last_name), ''),
    CASE
      WHEN POSITION(' ' IN BTRIM(name)) > 0
        THEN NULLIF(BTRIM(SUBSTRING(BTRIM(name) FROM POSITION(' ' IN BTRIM(name)) + 1)), '')
      ELSE NULL
    END
  )
WHERE name IS NOT NULL
  AND (
    NULLIF(BTRIM(first_name), '') IS NULL
    OR NULLIF(BTRIM(last_name), '') IS NULL
  );

UPDATE users
SET name = NULLIF(BTRIM(CONCAT_WS(' ', NULLIF(BTRIM(first_name), ''), NULLIF(BTRIM(last_name), ''))), '')
WHERE NULLIF(BTRIM(first_name), '') IS NOT NULL
  AND NULLIF(BTRIM(last_name), '') IS NOT NULL;

UPDATE users
SET profile_completed = FALSE
WHERE email NOT ILIKE '%@guest.humanly.local'
  AND (
    NULLIF(BTRIM(first_name), '') IS NULL
    OR NULLIF(BTRIM(last_name), '') IS NULL
  );

COMMENT ON COLUMN users.first_name IS 'Structured first name collected during registration or profile completion.';
COMMENT ON COLUMN users.last_name IS 'Structured last name collected during registration or profile completion.';
COMMENT ON COLUMN users.name IS 'Legacy full display name kept in sync for compatibility.';
COMMENT ON COLUMN users.profile_completed IS 'Whether the account has completed required basic profile information.';
