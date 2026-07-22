CREATE TABLE IF NOT EXISTS public_ask_answers (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  answer TEXT NOT NULL,
  results_json TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER
);

CREATE TABLE IF NOT EXISTS public_ask_interactions (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  question TEXT NOT NULL,
  request_json TEXT NOT NULL,
  actor_id TEXT,
  access_class TEXT,
  status TEXT NOT NULL CHECK (status IN ('succeeded', 'failed')),
  failure_code TEXT,
  answer_id TEXT REFERENCES public_ask_answers(id) ON DELETE SET NULL,
  exported_at TEXT
);

CREATE INDEX IF NOT EXISTS public_ask_interactions_unexported
  ON public_ask_interactions(exported_at, created_at);
CREATE INDEX IF NOT EXISTS public_ask_interactions_answer
  ON public_ask_interactions(answer_id);

INSERT OR IGNORE INTO public_ask_answers(
  id, created_at, answer, results_json, model,
  prompt_tokens, completion_tokens, total_tokens
)
SELECT id, created_at, answer, results_json, model,
       prompt_tokens, completion_tokens, total_tokens
FROM learning_records;

INSERT OR IGNORE INTO public_ask_interactions(
  id, event_id, created_at, question, request_json, actor_id,
  access_class, status, failure_code, answer_id, exported_at
)
SELECT id, id, created_at, question, request_json, NULL,
       NULL, 'succeeded', NULL, id, exported_at
FROM learning_records;
