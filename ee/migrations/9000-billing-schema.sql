-- Humanly Cloud billing schema placeholder. Payment processing is intentionally
-- out of scope until the billing product and entitlement model are approved.
CREATE TABLE IF NOT EXISTS billing_accounts (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  plan_key TEXT NOT NULL DEFAULT 'free',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE billing_accounts IS
  'Humanly Cloud billing ownership placeholder; no payment data is stored.';
