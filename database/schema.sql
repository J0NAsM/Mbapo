-- Mbapo PostgreSQL schema (PostgreSQL 16+)
-- Applied automatically by server.js when DATABASE_URL is configured.
-- The database is the source of truth; data/mbapo.json remains development-only.

CREATE TABLE IF NOT EXISTS schema_migrations (
  name text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS application_state_version (
  id smallint PRIMARY KEY CHECK (id = 1),
  version bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO application_state_version (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS platform_settings (
  id smallint PRIMARY KEY CHECK (id = 1),
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS accounts (
  id text PRIMARY KEY,
  name varchar(80) NOT NULL,
  email varchar(254) NOT NULL UNIQUE,
  role varchar(20) NOT NULL CHECK (role IN ('client', 'professional', 'admin')),
  verified boolean NOT NULL DEFAULT false,
  password_salt text NOT NULL,
  password_hash text NOT NULL,
  token_version integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS accounts_role_idx ON accounts (role);

CREATE TABLE IF NOT EXISTS user_profiles (
  account_id text PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Each aggregate owns its payload during the transitional API phase. IDs and
-- foreign keys stay relational, allowing a gradual migration to typed columns
-- without another data-store change.
CREATE TABLE IF NOT EXISTS professionals (
  id integer PRIMARY KEY,
  payload jsonb NOT NULL,
  owner_account_id text REFERENCES accounts(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS jobs (
  id integer PRIMARY KEY,
  payload jsonb NOT NULL,
  owner_account_id text REFERENCES accounts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jobs_owner_idx ON jobs (owner_account_id);

CREATE TABLE IF NOT EXISTS bookings (
  id integer PRIMARY KEY,
  payload jsonb NOT NULL,
  client_account_id text REFERENCES accounts(id) ON DELETE RESTRICT,
  professional_id integer REFERENCES professionals(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bookings_client_idx ON bookings (client_account_id);
CREATE INDEX IF NOT EXISTS bookings_professional_idx ON bookings (professional_id);

CREATE TABLE IF NOT EXISTS messages (
  id integer PRIMARY KEY,
  payload jsonb NOT NULL,
  client_account_id text REFERENCES accounts(id) ON DELETE CASCADE,
  professional_id integer REFERENCES professionals(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_thread_idx ON messages (client_account_id, professional_id, id);

CREATE TABLE IF NOT EXISTS transactions (
  id integer PRIMARY KEY,
  payload jsonb NOT NULL,
  account_id text REFERENCES accounts(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS transactions_account_idx ON transactions (account_id, id DESC);

CREATE TABLE IF NOT EXISTS reviews (
  id integer PRIMARY KEY,
  payload jsonb NOT NULL,
  booking_id integer REFERENCES bookings(id) ON DELETE CASCADE,
  account_id text REFERENCES accounts(id) ON DELETE SET NULL,
  professional_id integer REFERENCES professionals(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_id)
);

CREATE TABLE IF NOT EXISTS verifications (
  id integer PRIMARY KEY,
  payload jsonb NOT NULL,
  account_id text REFERENCES accounts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id integer PRIMARY KEY,
  payload jsonb NOT NULL,
  actor_account_id text REFERENCES accounts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_log_actor_idx ON audit_log (actor_account_id, id DESC);

CREATE TABLE IF NOT EXISTS growth_events (
  id text PRIMARY KEY,
  payload jsonb NOT NULL,
  actor_account_id text REFERENCES accounts(id) ON DELETE SET NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS growth_events_occurred_idx ON growth_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS growth_events_actor_idx ON growth_events (actor_account_id, occurred_at DESC);
