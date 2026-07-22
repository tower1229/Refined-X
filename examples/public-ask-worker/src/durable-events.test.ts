import assert from "node:assert/strict";
import test from "node:test";
import {
  enqueueDurableEvent,
  persistDurableEvent,
  persistQueueEvent,
  type DurableAskEvent,
  type SecurityAuditEvent,
} from "./durable-events.ts";

const event: DurableAskEvent = {
  version: 1,
  eventId: "event-1",
  interaction: {
    id: "interaction-1",
    createdAt: "2026-07-03T00:00:00.000Z",
    question: "问题",
    request: { query: { text: "问题" }, prefer: { mode: "list" } },
    actorId: "actor",
    keyId: null,
    accessClass: "anonymous",
    status: "succeeded",
    failureCode: null,
    answerId: "answer-1",
    redactionCategories: [],
  },
  answer: {
    id: "answer-1",
    createdAt: "2026-07-03T00:00:00.000Z",
    text: "",
    results: [{ "@type": "Article", name: "证据" }],
    model: "none",
    usage: { promptTokens: null, completionTokens: null, totalTokens: null },
    redactionCategories: [],
  },
};

test("retries enqueue once with the exact same event id", async () => {
  const sent: DurableAskEvent[] = [];
  await enqueueDurableEvent({
    async send(value: DurableAskEvent) {
      sent.push(value);
      if (sent.length === 1) throw new Error("temporary queue failure");
    },
  } as unknown as Queue<DurableAskEvent>, event);
  assert.equal(sent.length, 2);
  assert.equal(sent[0], sent[1]);
  assert.equal(sent[0].eventId, "event-1");
});

test("persists answer and interaction with idempotent inserts and nullable token usage", async () => {
  const sql: string[] = [];
  const bindings: unknown[][] = [];
  const db = {
    prepare(statement: string) {
      sql.push(statement);
      return { bind(...values: unknown[]) { bindings.push(values); return { statement, values }; } };
    },
    async batch(statements: unknown[]) { return statements; },
  } as unknown as D1Database;
  await persistDurableEvent(db, event);
  assert.equal(sql.length, 2);
  assert.match(sql[0], /INSERT OR IGNORE INTO public_ask_answers/);
  assert.match(sql[1], /INSERT OR IGNORE INTO public_ask_interactions/);
  assert.deepEqual(bindings[0].slice(-4, -1), [null, null, null]);
  assert.equal(bindings[1].at(-2), "answer-1");
});

test("persists rejection audits separately from interactions and answers", async () => {
  let sql = "";
  let values: unknown[] = [];
  const db = {
    prepare(statement: string) {
      sql = statement;
      return { bind(...bound: unknown[]) { values = bound; return { async run() {} }; } };
    },
  } as unknown as D1Database;
  const event: SecurityAuditEvent = {
    version: 1,
    eventId: "audit-1",
    securityAudit: {
      id: "audit-1",
      createdAt: "2026-07-04T00:00:00.000Z",
      requestId: "request-1",
      route: "/ask",
      method: "POST",
      actorId: "actor-hash",
      keyId: null,
      accessClass: "anonymous",
      action: "reject",
      reasonCode: "JSON_MALFORMED",
    },
  };

  await persistQueueEvent(db, event);
  assert.match(sql, /public_ask_security_audits/);
  assert.deepEqual(values, [
    "audit-1", "2026-07-04T00:00:00.000Z", "request-1", "/ask", "POST",
    "actor-hash", null, "anonymous", "reject", "JSON_MALFORMED",
  ]);
});
