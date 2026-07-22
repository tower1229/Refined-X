ALTER TABLE public_ask_interactions
  ADD COLUMN redaction_categories TEXT NOT NULL DEFAULT '[]';
ALTER TABLE public_ask_answers
  ADD COLUMN redaction_categories TEXT NOT NULL DEFAULT '[]';
