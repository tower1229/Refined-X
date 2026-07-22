import type { AccessClass } from "./access-guard.ts";
import type { NlWebRequest, NlWebResult } from "./protocol.ts";
import type { CredentialCategory } from "./content-policy.ts";

export type TokenUsage = {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
};

export type DurableAskEvent = {
  version: 1;
  eventId: string;
  interaction: {
    id: string;
    createdAt: string;
    question: string;
    request: NlWebRequest;
    actorId: string | null;
    keyId: string | null;
    accessClass: AccessClass;
    status: "succeeded" | "failed";
    failureCode: string | null;
    answerId: string | null;
    redactionCategories: CredentialCategory[];
  };
  answer: {
    id: string;
    createdAt: string;
    text: string;
    results: NlWebResult[];
    model: string;
    usage: TokenUsage;
    redactionCategories: CredentialCategory[];
  } | null;
};

export type SecurityAuditEvent = {
  version: 1;
  eventId: string;
  securityAudit: {
    id: string;
    createdAt: string;
    requestId: string;
    route: "/ask" | "/mcp";
    method: string;
    actorId: string | null;
    keyId: string | null;
    accessClass: AccessClass;
    action: "reject" | "rate_limit" | "temporary_block" | "manual_block";
    reasonCode: string;
  };
};

export type PublicAskQueueEvent = DurableAskEvent | SecurityAuditEvent;

export async function enqueueSecurityAudit(queue: Queue<PublicAskQueueEvent>, event: SecurityAuditEvent) {
  await queue.send(event);
}

export async function enqueueDurableEvent(
  queue: Queue<DurableAskEvent>,
  event: DurableAskEvent,
  signal?: AbortSignal,
) {
  try {
    await queue.send(event);
  } catch {
    if (signal?.aborted) throw signal.reason;
    await queue.send(event);
  }
}

export async function persistDurableEvent(db: D1Database, event: DurableAskEvent) {
  const statements: D1PreparedStatement[] = [];
  if (event.answer) {
    statements.push(
      db.prepare(
      `INSERT OR IGNORE INTO public_ask_answers(
           id, created_at, expires_at, answer, results_json, model,
           prompt_tokens, completion_tokens, total_tokens, redaction_categories
         ) VALUES (?1, ?2, strftime('%Y-%m-%dT%H:%M:%fZ', ?2, '+180 days'), ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
      ).bind(
        event.answer.id,
        event.answer.createdAt,
        event.answer.text,
        JSON.stringify(event.answer.results),
        event.answer.model,
        event.answer.usage.promptTokens,
        event.answer.usage.completionTokens,
        event.answer.usage.totalTokens,
        JSON.stringify(event.answer.redactionCategories),
      ),
    );
  }
  statements.push(
    db.prepare(
      `INSERT OR IGNORE INTO public_ask_interactions(
         id, event_id, created_at, expires_at, question, request_json, actor_id,
         key_id, access_class, status, failure_code, answer_id, redaction_categories
       ) VALUES (?1, ?2, ?3, strftime('%Y-%m-%dT%H:%M:%fZ', ?3, '+180 days'), ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`,
    ).bind(
      event.interaction.id,
      event.eventId,
      event.interaction.createdAt,
      event.interaction.question,
      JSON.stringify(event.interaction.request),
      event.interaction.actorId,
      event.interaction.keyId,
      event.interaction.accessClass,
      event.interaction.status,
      event.interaction.failureCode,
      event.interaction.answerId,
      JSON.stringify(event.interaction.redactionCategories),
    ),
  );
  await db.batch(statements);
}

export async function persistQueueEvent(db: D1Database, event: PublicAskQueueEvent) {
  if ("securityAudit" in event) {
    const audit = event.securityAudit;
    await db.prepare(
      `INSERT OR IGNORE INTO public_ask_security_audits(
         id, created_at, request_id, route, method, actor_id, key_id,
         access_class, action, reason_code
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
    ).bind(
      audit.id,
      audit.createdAt,
      audit.requestId,
      audit.route,
      audit.method,
      audit.actorId,
      audit.keyId,
      audit.accessClass,
      audit.action,
      audit.reasonCode,
    ).run();
    return;
  }
  await persistDurableEvent(db, event);
}
