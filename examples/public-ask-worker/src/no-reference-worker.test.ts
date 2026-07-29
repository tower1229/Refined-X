import assert from "node:assert/strict";
import test from "node:test";
import { handleAsk } from "./index.ts";
import { NO_REFERENCE_ANSWER_VARIANTS } from "./no-reference-answer.ts";

function acceptedEnv(overrides: Record<string, unknown> = {}) {
  return {
    ACTOR_HMAC_KEY: "test-secret",
    TURNSTILE_SECRET_KEY: "turnstile-secret",
    ALLOWED_ORIGIN: "https://refined-x.com",
    DAILY_REQUEST_LIMIT: "1000",
    DAILY_GENERATION_LIMIT: "200",
    SITE_URL: "https://refined-x.com",
    DEFAULT_LANGUAGE: "zh-CN",
    DEEPSEEK_MODEL: "test-model",
    ASK_RATE_LIMITER: { async limit() { return { success: true }; } },
    BROWSER_RATE_LIMITER: { async limit() { return { success: true }; } },
    DB: {
      prepare() {
        return {
          bind() { return this; },
          async first() { return { accepted_count: 1 }; },
        };
      },
    },
    PUBLIC_CONTENT: { async search() { return { chunks: [] }; } },
    LEARNING_QUEUE: { async send() {} },
    ...overrides,
  } as unknown as Env;
}

test("no-reference summarize responses use an approved variant without model calls", async (t) => {
  let fetchCalls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    fetchCalls += 1;
    return Response.json({ success: true, hostname: "refined-x.com", action: "public-ask" });
  });
  const events: Array<{ answer: { text: string; model: string } | null }> = [];
  const env = acceptedEnv({
    LEARNING_QUEUE: { async send(event: typeof events[number]) { events.push(event); } },
  });
  const response = await handleAsk(new Request("https://ask.refined-x.com/ask", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "cf-connecting-ip": "203.0.113.7",
      "cf-turnstile-response": "valid-token",
    },
    body: JSON.stringify({ query: { text: "x" }, prefer: { mode: "summarize" } }),
  }), env);
  const body = await response.json() as { results: Array<{ "@type": string; text?: string }> };
  const summary = body.results.find((item) => item["@type"] === "SearchSummary");

  assert.equal(response.status, 200);
  assert.ok(summary?.text);
  assert.ok(NO_REFERENCE_ANSWER_VARIANTS.includes(summary.text as typeof NO_REFERENCE_ANSWER_VARIANTS[number]));
  assert.equal(events[0].answer?.text, summary.text);
  assert.equal(events[0].answer?.model, "none");
  assert.equal(fetchCalls, 1);
});

test("streamed no-reference summarize responses stay on the normal SearchSummary path", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ success: true, hostname: "refined-x.com", action: "public-ask" }));
  const response = await handleAsk(new Request("https://ask.refined-x.com/ask", {
    method: "POST",
    headers: {
      accept: "text/event-stream",
      "content-type": "application/json",
      "cf-connecting-ip": "203.0.113.7",
      "cf-turnstile-response": "valid-token",
    },
    body: JSON.stringify({
      query: { text: "x" },
      prefer: { streaming: true, mode: "summarize" },
    }),
  }), acceptedEnv());
  const text = await response.text();
  const result = text
    .split("\n\n")
    .map((event) => event.split("\n").find((line) => line.startsWith("data: "))?.slice(6))
    .filter(Boolean)
    .map((data) => JSON.parse(data!))
    .find((payload) => payload.item?.["@type"] === "SearchSummary") as { item?: { text?: string } } | undefined;

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/event-stream; charset=utf-8");
  assert.ok(result?.item?.text);
  assert.ok(NO_REFERENCE_ANSWER_VARIANTS.includes(result.item.text as typeof NO_REFERENCE_ANSWER_VARIANTS[number]));
});
