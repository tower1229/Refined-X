import assert from "node:assert/strict";
import test from "node:test";
import { DeadlineExceeded, RequestDeadline } from "./deadline.ts";

test("aborts a stage at its fixed timeout", async () => {
  const deadline = new RequestDeadline(undefined, 100);
  await assert.rejects(
    deadline.run("ai_search", 5, (signal) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    })),
    (error: unknown) => error instanceof DeadlineExceeded && error.stage === "ai_search",
  );
});

test("caps a stage by the remaining total request deadline", async () => {
  const deadline = new RequestDeadline(undefined, 5);
  const started = Date.now();
  await assert.rejects(
    deadline.run("model", 100, async () => new Promise(() => {})),
    (error: unknown) => error instanceof DeadlineExceeded && error.stage === "model",
  );
  assert.ok(Date.now() - started < 80);
});
