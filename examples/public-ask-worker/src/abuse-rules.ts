import type { ChallengeFailureCode } from "./access-guard.ts";

export const abusePolicy = {
  windowMs: 10 * 60 * 1000,
  threshold: 5,
  blockMs: 15 * 60 * 1000,
} as const;

export type AbuseReasonCode =
  | "BODY_REQUIRED"
  | "BODY_TOO_LARGE"
  | "JSON_MALFORMED"
  | "INVALID_CONTENT_TYPE"
  | "INVALID_QUERY_SHAPE"
  | "UNSUPPORTED_FIELD"
  | "UNSUPPORTED_FORMAT"
  | "UNSUPPORTED_MODE"
  | "CHALLENGE_INVALID"
  | "CHALLENGE_EXPIRED"
  | "CHALLENGE_REQUIRED"
  | "API_KEY_INVALID"
  | "API_KEY_REVOKED"
  | "MODE_FORBIDDEN";

export type AbuseSubject = { type: "actor" | "key"; id: string };
type D1Executor = Pick<D1Database, "prepare">;

type ViolationInput =
  | { kind: "envelope"; message: string }
  | { kind: "request"; code: "INVALID_QUERY" | "UNSUPPORTED_FORMAT" | "UNSUPPORTED_MODE"; message: string }
  | { kind: "challenge"; code: ChallengeFailureCode }
  | { kind: "api_key"; reason: "missing" | "invalid" | "revoked" };

export function classifyRequestViolation(input: ViolationInput): AbuseReasonCode | null {
  if (input.kind === "envelope") {
    if (input.message.includes("16 KiB")) return "BODY_TOO_LARGE";
    if (input.message.includes("valid JSON")) return "JSON_MALFORMED";
    if (input.message.includes("required")) return "BODY_REQUIRED";
    return "INVALID_QUERY_SHAPE";
  }
  if (input.kind === "request") {
    if (input.code === "UNSUPPORTED_FORMAT") return "UNSUPPORTED_FORMAT";
    if (input.code === "UNSUPPORTED_MODE") return "UNSUPPORTED_MODE";
    return input.message.startsWith("unsupported field:") ? "UNSUPPORTED_FIELD" : "INVALID_QUERY_SHAPE";
  }
  if (input.kind === "challenge") {
    return input.code === "CHALLENGE_UNAVAILABLE" ? null : input.code;
  }
  if (input.reason === "invalid") return "API_KEY_INVALID";
  if (input.reason === "revoked") return "API_KEY_REVOKED";
  return null;
}

export function blockDecision(blockedUntil: number | null, now: number) {
  if (typeof blockedUntil !== "number" || !Number.isFinite(blockedUntil) || blockedUntil <= now) return null;
  return { blockedUntil, retryAfter: Math.ceil((blockedUntil - now) / 1000) };
}

export async function getTemporaryBlock(db: D1Executor, subject: AbuseSubject, now = Date.now()) {
  const row = await db.prepare(
    `SELECT blocked_until
     FROM public_ask_abuse_blocks
     WHERE subject_type = ?1 AND subject_id = ?2 AND blocked_until > ?3`,
  ).bind(subject.type, subject.id, now).first<{ blocked_until: number }>();
  return blockDecision(row?.blocked_until ?? null, now);
}

export async function getManualBlock(db: D1Executor, subject: AbuseSubject) {
  const row = await db.prepare(
    `SELECT reason_code
     FROM public_ask_manual_blocks
     WHERE subject_type = ?1 AND subject_id = ?2 AND enabled = 1`,
  ).bind(subject.type, subject.id).first<{ reason_code: string }>();
  return typeof row?.reason_code === "string" ? { reasonCode: row.reason_code } : null;
}

export async function recordExplicitViolation(
  db: D1Database,
  subject: AbuseSubject,
  requestId: string,
  reasonCode: AbuseReasonCode,
  now = Date.now(),
) {
  const session: D1Executor = typeof db.withSession === "function"
    ? db.withSession("first-primary")
    : db;
  await session.prepare(
    `INSERT INTO public_ask_abuse_violations(
       id, subject_type, subject_id, request_id, reason_code, occurred_at
     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
  ).bind(crypto.randomUUID(), subject.type, subject.id, requestId, reasonCode, now).run();
  return getTemporaryBlock(session, subject, now);
}
