import assert from "node:assert/strict";
import test from "node:test";
import { readRequestEnvelope, RequestEnvelopeProblem } from "./request-envelope.ts";

test("rejects a body larger than 16 KiB before parsing all of it", async () => {
  let pulls = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls += 1;
      controller.enqueue(new Uint8Array(9 * 1024));
      if (pulls === 3) controller.close();
    },
  });
  const request = new Request("https://ask.refined-x.com/ask", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    duplex: "half",
  } as RequestInit & { duplex: "half" });

  await assert.rejects(
    readRequestEnvelope(request),
    (error: unknown) =>
      error instanceof RequestEnvelopeProblem &&
      error.code === "INVALID_QUERY" &&
      error.message.includes("16 KiB"),
  );
  assert.equal(pulls, 2);
});

test("normalizes malformed JSON as an INVALID_QUERY problem", async () => {
  const request = new Request("https://ask.refined-x.com/ask", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{not json",
  });
  await assert.rejects(
    readRequestEnvelope(request),
    (error: unknown) => error instanceof RequestEnvelopeProblem && error.code === "INVALID_QUERY",
  );
});
