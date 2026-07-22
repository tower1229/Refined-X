import assert from "node:assert/strict";
import test from "node:test";
import {
  parseNlWebRequest,
  RequestProblem,
  streamResponse,
  fitResponseResults,
  type NlWebResult,
} from "./protocol.ts";

test("accepts and normalizes the supported NLWeb 0.55 request envelope", () => {
  const request = parseNlWebRequest({
    query: { text: "  师兄是谁？  " },
    context: {},
    prefer: { streaming: true, mode: "list, summarize" },
    meta: { version: "0.55" },
  });
  assert.equal(request.query.text, "师兄是谁？");
  assert.equal("context" in request, false);
});

test("rejects unsupported and unknown fields with their field paths", () => {
  for (const [body, path] of [
    [{ query: { text: "x", filter: "private" } }, "query.filter"],
    [{ query: { text: "x", site: "https://example.com" } }, "query.site"],
    [{ query: { text: "x" }, context: { previous: "y" } }, "context.previous"],
    [{ query: { text: "x" }, prefer: { max_results: 99 } }, "prefer.max_results"],
    [{ query: { text: "x" }, meta: { remember: true } }, "meta.remember"],
    [{ query: { text: "x" }, model: "expensive" }, "model"],
  ] as const) {
    assert.throws(
      () => parseNlWebRequest(body),
      (error: unknown) =>
        error instanceof RequestProblem &&
        error.code === "INVALID_QUERY" &&
        error.message.includes(path),
    );
  }
});

test("rejects the legacy flat question contract", () => {
  assert.throws(
    () => parseNlWebRequest({ question: "师兄是谁？" }),
    (error: unknown) => error instanceof RequestProblem && error.code === "INVALID_QUERY",
  );
});

test("rejects unsupported response formats and modes", () => {
  assert.throws(
    () => parseNlWebRequest({ query: { text: "x" }, prefer: { response_format: "legacy" } }),
    (error: unknown) => error instanceof RequestProblem && error.code === "UNSUPPORTED_FORMAT",
  );
  assert.throws(
    () => parseNlWebRequest({ query: { text: "x" }, prefer: { mode: "generate" } }),
    (error: unknown) => error instanceof RequestProblem && error.code === "UNSUPPORTED_MODE",
  );
});

test("emits NLWeb start result complete SSE events", async () => {
  const results: NlWebResult[] = [{ "@type": "SearchSummary", text: "回答" }];
  const response = streamResponse("request-id", results);
  const body = await response.text();
  assert.match(body, /event: start/);
  assert.match(body, /event: result/);
  assert.match(body, /event: complete/);
  assert.match(body, /"version":"0.55"/);
  assert.doesNotMatch(body, /api_version|message_type/);
});

test("fits JSON and SSE below 128 KiB without removing grounding or complete", async () => {
  const results: NlWebResult[] = Array.from({ length: 8 }, (_, index) => ({
    "@type": "Article",
    name: `source-${index}`,
    url: `https://refined-x.com/${index}`,
    description: "长".repeat(40_000),
    grounding: { url: `https://refined-x.com/${index}`, score: 1 },
  }));
  const fitted = fitResponseResults("request-id", results);
  const json = JSON.stringify({ _meta: { request_id: "request-id" }, results: fitted });
  const stream = await streamResponse("request-id", fitted).text();
  assert.ok(new TextEncoder().encode(json).byteLength <= 128 * 1024);
  assert.ok(new TextEncoder().encode(stream).byteLength <= 128 * 1024);
  assert.equal((stream.match(/event: complete/g) ?? []).length, 1);
  assert.ok(fitted.every((result) => result.grounding));
  assert.doesNotMatch(stream, /�/);
});
