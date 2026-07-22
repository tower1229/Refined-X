CREATE TABLE public_ask_cache_state (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  knowledge_version TEXT NOT NULL,
  synced_at TEXT NOT NULL
);

INSERT INTO public_ask_cache_state(singleton, knowledge_version, synced_at)
VALUES (1, 'bootstrap', '1970-01-01 00:00:00');
