import assert from "node:assert/strict";
import test from "node:test";
import { newestSuccessfulJob, refreshKnowledgeVersion } from "./knowledge-version.ts";

test("selects only the newest completed AI Search job without an end reason", () => {
  assert.deepEqual(newestSuccessfulJob([
    { id: "running", source: "schedule", started_at: "2026-07-04 10:00:00" },
    { id: "failed", source: "schedule", ended_at: "2026-07-04 09:00:00", end_reason: "failed" },
    { id: "older", source: "schedule", ended_at: "2026-07-04 08:00:00" },
    { id: "newer", source: "user", ended_at: "2026-07-04 09:30:00", end_reason: undefined },
  ]), { id: "newer", endedAt: "2026-07-04 09:30:00" });
});

test("advances the public knowledge version only after a successful sync", async () => {
  const writes: unknown[][] = [];
  const env = {
    PUBLIC_CONTENT: {
      jobs: { async list() { return { result: [
        { id: "job-ok", source: "schedule", ended_at: "2026-07-04 09:30:00", end_reason: null },
      ] }; } },
    },
    DB: {
      prepare(sql: string) {
        assert.match(sql, /public_ask_cache_state/);
        return { bind(...values: unknown[]) { writes.push(values); return { async run() {} }; } };
      },
    },
  } as unknown as Env;

  assert.equal(await refreshKnowledgeVersion(env), "job-ok");
  assert.deepEqual(writes, [["job-ok", "2026-07-04 09:30:00"]]);
});

test("does not advance when no AI Search sync completed successfully", async () => {
  let writes = 0;
  const env = {
    PUBLIC_CONTENT: { jobs: { async list() { return { result: [
      { id: "running", source: "schedule" },
      { id: "failed", source: "schedule", ended_at: "2026-07-04 09:30:00", end_reason: "failed" },
    ] }; } } },
    DB: { prepare() { writes += 1; throw new Error("must not write"); } },
  } as unknown as Env;

  assert.equal(await refreshKnowledgeVersion(env), null);
  assert.equal(writes, 0);
});
