CREATE TABLE IF NOT EXISTS public_ask_api_keys (
  key_id TEXT PRIMARY KEY,
  secret_digest TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'revoked')),
  allowed_modes TEXT NOT NULL,
  daily_limit INTEGER NOT NULL CHECK (daily_limit > 0),
  issued_at TEXT NOT NULL,
  rotated_at TEXT,
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS public_ask_key_usage (
  day TEXT NOT NULL,
  key_id TEXT NOT NULL REFERENCES public_ask_api_keys(key_id) ON DELETE CASCADE,
  accepted_requests INTEGER NOT NULL DEFAULT 0 CHECK (accepted_requests >= 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY(day, key_id)
);

ALTER TABLE public_ask_interactions
  ADD COLUMN key_id TEXT REFERENCES public_ask_api_keys(key_id);
CREATE INDEX IF NOT EXISTS public_ask_interactions_key
  ON public_ask_interactions(key_id, created_at);
