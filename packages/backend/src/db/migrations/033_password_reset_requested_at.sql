-- Track when password reset links are issued so expiry can be enforced from
-- request time, not only from the mutable expiry timestamp.
ALTER TABLE users
ADD COLUMN IF NOT EXISTS password_reset_requested_at TIMESTAMP;

-- Legacy reset links were created before request-time tracking existed and may
-- still have a longer expiry window. Require users with pending legacy links to
-- request a fresh 30-minute link.
UPDATE users
SET password_reset_token = NULL,
    password_reset_expires = NULL,
    password_reset_requested_at = NULL
WHERE password_reset_token IS NOT NULL
  AND password_reset_requested_at IS NULL;
