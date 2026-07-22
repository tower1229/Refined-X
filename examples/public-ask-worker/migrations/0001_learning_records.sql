CREATE TABLE IF NOT EXISTS daily_quotas (
  day TEXT PRIMARY KEY,
  accepted_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS learning_records (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  request_json TEXT NOT NULL,
  results_json TEXT NOT NULL,
  client_ip TEXT,
  user_agent TEXT,
  model TEXT NOT NULL,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,
  exported_at TEXT,
  processed_at TEXT,
  processing_note TEXT
);

CREATE INDEX IF NOT EXISTS learning_records_unexported
  ON learning_records(exported_at, created_at);
