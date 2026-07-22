import type { RejectionPayload } from "./abuse-guard.ts";

function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function updatedAt(now: Date): string {
  return now.toISOString();
}

export async function reserveRequest(db: D1Database, limit: number, now = new Date()) {
  const row = await db.prepare(
    `INSERT INTO public_ask_usage(day, accepted_requests, generation_reserved, generation_committed, updated_at)
     VALUES (?1, 1, 0, 0, ?2)
     ON CONFLICT(day) DO UPDATE SET
       accepted_requests = accepted_requests + 1,
       updated_at = excluded.updated_at
     WHERE accepted_requests < ?3
     RETURNING accepted_requests`,
  )
    .bind(utcDay(now), updatedAt(now), limit)
    .first<{ accepted_requests: number }>();
  return row !== null;
}

export async function reserveGeneration(db: D1Database, limit: number, now = new Date()) {
  const row = await db.prepare(
    `INSERT INTO public_ask_usage(day, accepted_requests, generation_reserved, generation_committed, updated_at)
     VALUES (?1, 0, 1, 0, ?2)
     ON CONFLICT(day) DO UPDATE SET
       generation_reserved = generation_reserved + 1,
       updated_at = excluded.updated_at
     WHERE generation_committed + generation_reserved < ?3
     RETURNING generation_reserved`,
  )
    .bind(utcDay(now), updatedAt(now), limit)
    .first<{ generation_reserved: number }>();
  return row !== null;
}

export async function commitGeneration(db: D1Database, now = new Date()) {
  await db.prepare(
    `UPDATE public_ask_usage
     SET generation_reserved = generation_reserved - 1,
         generation_committed = generation_committed + 1,
         updated_at = ?2
     WHERE day = ?1 AND generation_reserved > 0`,
  ).bind(utcDay(now), updatedAt(now)).run();
}

export async function releaseGeneration(db: D1Database, now = new Date()) {
  await db.prepare(
    `UPDATE public_ask_usage
     SET generation_reserved = generation_reserved - 1,
         updated_at = ?2
     WHERE day = ?1 AND generation_reserved > 0`,
  ).bind(utcDay(now), updatedAt(now)).run();
}

export async function reserveKeyRequest(
  db: D1Database,
  keyId: string,
  limit: number,
  now = new Date(),
) {
  const row = await db.prepare(
    `INSERT INTO public_ask_key_usage(day, key_id, accepted_requests, updated_at)
     VALUES (?1, ?2, 1, ?3)
     ON CONFLICT(day, key_id) DO UPDATE SET
       accepted_requests = accepted_requests + 1,
       updated_at = excluded.updated_at
     WHERE accepted_requests < ?4
     RETURNING accepted_requests`,
  )
    .bind(utcDay(now), keyId, updatedAt(now), limit)
    .first<{ accepted_requests: number }>();
  return row !== null;
}

export async function releaseKeyRequest(db: D1Database, keyId: string, now = new Date()) {
  await db.prepare(
    `UPDATE public_ask_key_usage
     SET accepted_requests = accepted_requests - 1,
         updated_at = ?3
     WHERE day = ?1 AND key_id = ?2 AND accepted_requests > 0`,
  ).bind(utcDay(now), keyId, updatedAt(now)).run();
}

export function retryAfterNextUtcDay(now = new Date()) {
  const nextDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(1, Math.ceil((nextDay - now.getTime()) / 1000));
}

export function budgetExhaustedRejection(budgetNow: Date, message = "今日公开问答额度已用完。"): RejectionPayload {
  return {
    ok: false,
    code: "BUDGET_EXHAUSTED",
    message,
    status: 429,
    retryAfter: retryAfterNextUtcDay(budgetNow),
  };
}
