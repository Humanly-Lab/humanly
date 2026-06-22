-- Canonicalize user emails so Writer Portal and Publisher Portal identities
-- cannot split by casing or accidental surrounding whitespace.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM (
            SELECT lower(trim(email)) AS canonical_email, COUNT(*) AS user_count
            FROM users
            GROUP BY lower(trim(email))
            HAVING COUNT(*) > 1
        ) duplicate_emails
    ) THEN
        RAISE EXCEPTION 'Cannot normalize user emails: duplicate case-insensitive user emails exist.';
    END IF;
END $$;

UPDATE users
SET email = lower(trim(email))
WHERE email <> lower(trim(email));

UPDATE user_oauth_accounts
SET email = lower(trim(email))
WHERE email <> lower(trim(email));

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower_trim_unique
    ON users (lower(trim(email)));
