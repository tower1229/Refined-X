ALTER TABLE public_ask_answers ADD COLUMN expires_at TEXT;
UPDATE public_ask_answers SET expires_at = strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+180 days') WHERE expires_at IS NULL;

ALTER TABLE public_ask_interactions ADD COLUMN expires_at TEXT;
UPDATE public_ask_interactions SET expires_at = strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+180 days') WHERE expires_at IS NULL;

CREATE INDEX public_ask_answers_expiry ON public_ask_answers(expires_at);
CREATE INDEX public_ask_interactions_expiry ON public_ask_interactions(expires_at);

CREATE TRIGGER public_ask_answers_set_expiry
AFTER INSERT ON public_ask_answers
WHEN NEW.expires_at IS NULL
BEGIN
  UPDATE public_ask_answers
  SET expires_at = strftime('%Y-%m-%dT%H:%M:%fZ', NEW.created_at, '+180 days')
  WHERE id = NEW.id;
END;

CREATE TRIGGER public_ask_interactions_set_expiry
AFTER INSERT ON public_ask_interactions
WHEN NEW.expires_at IS NULL
BEGIN
  UPDATE public_ask_interactions
  SET expires_at = strftime('%Y-%m-%dT%H:%M:%fZ', NEW.created_at, '+180 days')
  WHERE id = NEW.id;
END;

CREATE TABLE public_ask_retention_aggregates (
  metric_day TEXT NOT NULL,
  metric TEXT NOT NULL CHECK (metric IN ('security_audit', 'abuse_violation', 'answer', 'interaction')),
  record_count INTEGER NOT NULL CHECK (record_count >= 0),
  PRIMARY KEY(metric_day, metric)
);
