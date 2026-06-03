-- Store the minimal profile data collected after account creation.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS profile_completed BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN users.name IS 'Display name collected during user profile onboarding.';
COMMENT ON COLUMN users.profile_completed IS 'Whether the user has completed first-dashboard basic info onboarding.';
