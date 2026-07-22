CREATE TABLE public_ask_abuse_violations (
  id TEXT PRIMARY KEY,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('actor', 'key')),
  subject_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  occurred_at INTEGER NOT NULL
);

CREATE INDEX public_ask_abuse_violations_window
  ON public_ask_abuse_violations(subject_type, subject_id, occurred_at);

CREATE TABLE public_ask_abuse_blocks (
  subject_type TEXT NOT NULL CHECK (subject_type IN ('actor', 'key')),
  subject_id TEXT NOT NULL,
  blocked_until INTEGER NOT NULL,
  reason_code TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(subject_type, subject_id)
);

CREATE TRIGGER public_ask_abuse_block_after_fifth
AFTER INSERT ON public_ask_abuse_violations
WHEN (
  SELECT COUNT(*)
  FROM public_ask_abuse_violations
  WHERE subject_type = NEW.subject_type
    AND subject_id = NEW.subject_id
    AND occurred_at >= NEW.occurred_at - 600000
    AND occurred_at <= NEW.occurred_at
) >= 5
BEGIN
  INSERT INTO public_ask_abuse_blocks(subject_type, subject_id, blocked_until, reason_code, updated_at)
  VALUES (NEW.subject_type, NEW.subject_id, NEW.occurred_at + 900000, NEW.reason_code, NEW.occurred_at)
  ON CONFLICT(subject_type, subject_id) DO UPDATE SET
    blocked_until = excluded.blocked_until,
    reason_code = excluded.reason_code,
    updated_at = excluded.updated_at
  WHERE public_ask_abuse_blocks.blocked_until <= NEW.occurred_at;
END;

CREATE TABLE public_ask_manual_blocks (
  subject_type TEXT NOT NULL CHECK (subject_type IN ('actor', 'key')),
  subject_id TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(subject_type, subject_id)
);

CREATE TABLE public_ask_security_audits (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  request_id TEXT NOT NULL,
  route TEXT NOT NULL,
  method TEXT NOT NULL,
  actor_id TEXT,
  key_id TEXT,
  access_class TEXT NOT NULL,
  action TEXT NOT NULL,
  reason_code TEXT NOT NULL
);

CREATE INDEX public_ask_security_audits_created
  ON public_ask_security_audits(created_at);
