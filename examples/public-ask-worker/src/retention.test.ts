import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { cleanupExpiredRecords, RAW_RETENTION_DAYS, SECURITY_RETENTION_DAYS } from "./retention.ts";

test("retention cleanup uses exact 30/180-day cutoffs and reference-safe order", async () => {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const db = {
    prepare(sql: string) {
      return { bind(...values: unknown[]) { calls.push({ sql, values }); return this; } };
    },
    async batch(statements: unknown[]) { return statements.map(() => ({ success: true })); },
  } as unknown as D1Database;
  const now = new Date("2026-07-04T12:00:00.000Z");
  await cleanupExpiredRecords(db, now);

  assert.equal(SECURITY_RETENTION_DAYS, 30);
  assert.equal(RAW_RETENTION_DAYS, 180);
  assert.ok(calls.some(({ values }) => values.includes("2026-06-04T12:00:00.000Z")));
  assert.ok(calls.some(({ values }) => values.includes("2026-07-04T12:00:00.000Z")));
  const sql = calls.map(({ sql }) => sql.replace(/\s+/g, " ")).join("\n");
  assert.ok(sql.indexOf("UPDATE public_ask_interactions SET answer_id = NULL") < sql.indexOf("DELETE FROM public_ask_answers"));
  assert.ok(sql.indexOf("DELETE FROM public_ask_answers") < sql.lastIndexOf("DELETE FROM public_ask_interactions"));
  assert.doesNotMatch(sql, /actor_id|key_id|question|answer\s*,|results_json|request_json/);
});

test("retention cleanup is one repeatable D1 batch", async () => {
  let batches = 0;
  const db = {
    prepare() { return { bind() { return this; } }; },
    async batch(statements: unknown[]) { batches += 1; assert.ok(statements.length >= 8); return []; },
  } as unknown as D1Database;
  await cleanupExpiredRecords(db, new Date("2026-07-04T12:00:00.000Z"));
  await cleanupExpiredRecords(db, new Date("2026-07-04T12:00:00.000Z"));
  assert.equal(batches, 2);
});

test("retention SQL clears answer references and remains idempotent", async () => {
  const sqlite = new DatabaseSync(":memory:");
  for (let migration = 1; migration <= 8; migration += 1) {
    const name = String(migration).padStart(4, "0");
    const file = new URL(`../migrations/${name}_${[
      "learning_records", "interactions_and_answers", "usage_governor", "trusted_machine_keys",
      "content_boundaries", "exact_cache", "abuse_rules", "retention",
    ][migration - 1]}.sql`, import.meta.url);
    sqlite.exec(readFileSync(file, "utf8"));
  }
  sqlite.exec(`
    INSERT INTO public_ask_answers(id, created_at, answer, results_json, model, redaction_categories)
      VALUES ('a-rolling', '2026-07-01T00:00:00.000Z', 'raw', '[]', 'm', '[]');
  `);
  assert.equal(
    sqlite.prepare("SELECT expires_at FROM public_ask_answers WHERE id = 'a-rolling'").get()!.expires_at,
    "2026-12-28T00:00:00.000Z",
  );
  sqlite.exec(`
    INSERT INTO public_ask_answers(id, created_at, expires_at, answer, results_json, model, redaction_categories)
      VALUES ('a-old', '2026-01-05T12:00:00.000Z', '2026-07-04T12:00:00.000Z', 'raw', '[]', 'm', '[]');
    INSERT INTO public_ask_interactions(id, event_id, created_at, expires_at, question, request_json, access_class, status, answer_id, redaction_categories)
      VALUES ('i-new', 'e-new', '2026-07-01T00:00:00.000Z', '2026-12-28T00:00:00.000Z', 'q', '{}', 'anonymous', 'succeeded', 'a-old', '[]');
  `);
  const db = {
    prepare(sql: string) {
      let values: unknown[] = [];
      return {
        bind(...next: unknown[]) { values = next; return this; },
        run() { (sqlite.prepare(sql).run as (...args: unknown[]) => unknown)(...values); },
      };
    },
    async batch(statements: Array<{ run(): void }>) {
      sqlite.exec("BEGIN");
      try { for (const statement of statements) statement.run(); sqlite.exec("COMMIT"); }
      catch (error) { sqlite.exec("ROLLBACK"); throw error; }
      return [];
    },
  } as unknown as D1Database;
  const now = new Date("2026-07-04T12:00:00.000Z");
  await cleanupExpiredRecords(db, now);
  await cleanupExpiredRecords(db, now);
  assert.equal(sqlite.prepare("SELECT answer_id FROM public_ask_interactions WHERE id = 'i-new'").get()!.answer_id, null);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM public_ask_answers WHERE id = 'a-old'").get()!.count, 0);
  assert.equal(sqlite.prepare("SELECT record_count FROM public_ask_retention_aggregates WHERE metric = 'answer'").get()!.record_count, 1);
});
