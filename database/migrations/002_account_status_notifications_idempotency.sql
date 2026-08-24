ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS status varchar(20) NOT NULL DEFAULT 'active'
  CHECK (status IN ('active', 'blocked'));

CREATE TABLE IF NOT EXISTS idempotency_keys (
  account_id text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  key text NOT NULL,
  method varchar(10) NOT NULL,
  path text NOT NULL,
  response_status integer NOT NULL,
  response_body jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, key, method, path)
);
CREATE INDEX IF NOT EXISTS idempotency_keys_created_idx
  ON idempotency_keys (created_at);

CREATE TABLE IF NOT EXISTS notifications (
  id text PRIMARY KEY,
  account_id text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  type varchar(80) NOT NULL,
  title varchar(160) NOT NULL,
  body varchar(500) NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_account_idx
  ON notifications (account_id, read_at, created_at DESC);
