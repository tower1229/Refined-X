CREATE TABLE IF NOT EXISTS public_ask_usage (
  day TEXT PRIMARY KEY,
  accepted_requests INTEGER NOT NULL DEFAULT 0 CHECK (accepted_requests >= 0),
  generation_reserved INTEGER NOT NULL DEFAULT 0 CHECK (generation_reserved >= 0),
  generation_committed INTEGER NOT NULL DEFAULT 0 CHECK (generation_committed >= 0),
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO public_ask_usage(
  day, accepted_requests, generation_reserved, generation_committed, updated_at
)
SELECT day, accepted_count, 0, 0, updated_at
FROM daily_quotas;
