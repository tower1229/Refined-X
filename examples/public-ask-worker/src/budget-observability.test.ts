import assert from "node:assert/strict";
import test from "node:test";
import { inspectBudgetThresholds } from "./budget-observability.ts";

test("emits stable 80 and 100 percent budget events without caller data", async () => {
  const db = {
    prepare() { return { bind() { return this; }, async first() { return { accepted_requests: 800, generation_committed: 200 }; } }; },
  } as unknown as D1Database;
  const events = await inspectBudgetThresholds(db, 1000, 200, new Date("2026-07-04T12:00:00Z"));
  assert.deepEqual(events, [
    { event: "budget_threshold", budget: "requests", threshold: 80, used: 800, limit: 1000, day: "2026-07-04" },
    { event: "budget_threshold", budget: "generations", threshold: 100, used: 200, limit: 200, day: "2026-07-04" },
  ]);
  assert.doesNotMatch(JSON.stringify(events), /actor|key|question/i);
});

test("emits nothing below 80 percent", async () => {
  const db = {
    prepare() { return { bind() { return this; }, async first() { return { accepted_requests: 799, generation_committed: 159 }; } }; },
  } as unknown as D1Database;
  assert.deepEqual(await inspectBudgetThresholds(db, 1000, 200, new Date("2026-07-04T12:00:00Z")), []);
});
