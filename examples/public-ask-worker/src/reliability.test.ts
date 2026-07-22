import assert from "node:assert/strict";
import test from "node:test";
import { handleAsk } from "./index.ts";

function acceptedEnv(overrides: Record<string, unknown> = {}) {
  return {
    ACTOR_HMAC_KEY: "test-secret",
    TURNSTILE_SECRET_KEY: "turnstile-secret",
    ALLOWED_ORIGIN: "https://refined-x.com",
    DAILY_REQUEST_LIMIT: "1000",
    DAILY_GENERATION_LIMIT: "200",
    SITE_URL: "https://refined-x.com",
    DEEPSEEK_MODEL: "test-model",
    ASK_RATE_LIMITER: { async limit() { return { success: true }; } },
    BROWSER_RATE_LIMITER: { async limit() { return { success: true }; } },
    DB: {
      prepare(sql: string) {
        return {
          bind() {
            return {
              async first() {
                return sql.includes("generation_reserved")
                  ? { generation_reserved: 1 }
                  : { accepted_requests: 1 };
              },
              async run() {},
            };
          },
        };
      },
    },
    PUBLIC_CONTENT: { async search() { return { chunks: [] }; } },
    LEARNING_QUEUE: { async send() {} },
    ...overrides,
  } as unknown as Env;
}

test("legal list requests return an NLWeb protocol answer", async () => {
  const response = await handleAsk(new Request("https://ask.refined-x.com/ask", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.7" },
    body: JSON.stringify({ query: { text: "x" }, prefer: { mode: "list" } }),
  }), acceptedEnv({
    PUBLIC_CONTENT: {
      async search() {
        return { chunks: [{ id: "chunk", score: 1, text: "evidence", item: { key: "/evidence" } }] };
      },
    },
  }));
  const body = await response.json() as {
    _meta: { response_type: string; version: string };
    results: unknown[];
  };
  assert.equal(response.status, 200);
  assert.equal(body._meta.response_type, "answer");
  assert.equal(body._meta.version, "0.55");
  assert.equal(body.results.length, 1);
});

test("legal summarize requests return an NLWeb protocol answer", async (t) => {
  let externalCalls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    externalCalls += 1;
    return externalCalls === 1
      ? Response.json({ success: true, hostname: "refined-x.com", action: "public-ask" })
      : Response.json({ choices: [{ message: { content: "summarized answer" } }] });
  });
  const response = await handleAsk(new Request("https://ask.refined-x.com/ask", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "cf-connecting-ip": "203.0.113.7",
      "cf-turnstile-response": "valid-token",
    },
    body: JSON.stringify({ query: { text: "x" }, prefer: { mode: "summarize" } }),
  }), acceptedEnv({
    PUBLIC_CONTENT: {
      async search() {
        return { chunks: [{ id: "chunk", score: 1, text: "evidence", item: { key: "/evidence" } }] };
      },
    },
  }));
  const body = await response.json() as {
    _meta: { response_type: string; version: string };
    results: Array<{ "@type": string; text?: string }>;
  };
  assert.equal(response.status, 200);
  assert.equal(body._meta.response_type, "answer");
  assert.equal(body._meta.version, "0.55");
  assert.ok(body.results.some((item) =>
    item["@type"] === "SearchSummary" && item.text === "summarized answer"));
});

test("streaming ask emits start result complete events from the public endpoint", async () => {
  const response = await handleAsk(new Request("https://ask.refined-x.com/ask", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.7" },
    body: JSON.stringify({ query: { text: "x" }, prefer: { mode: "list", streaming: true } }),
  }), acceptedEnv({
    PUBLIC_CONTENT: {
      async search() {
        return { chunks: [{ id: "chunk", score: 1, text: "evidence", item: { key: "/evidence" } }] };
      },
    },
  }));
  const body = await response.text();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/event-stream/);
  assert.deepEqual(
    [...body.matchAll(/^event: (.+)$/gm)].map((match) => match[1]),
    ["start", "result", "complete"],
  );
});

test("retrieval failures expose protocol-shaped upstream diagnostics", async () => {
  const events: Array<{ interaction: { failureCode: string } }> = [];
  const response = await handleAsk(new Request("https://ask.refined-x.com/ask", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.7" },
    body: JSON.stringify({ query: { text: "x" }, prefer: { mode: "list" } }),
  }), acceptedEnv({
    PUBLIC_CONTENT: { async search() { throw new Error("search unavailable"); } },
    LEARNING_QUEUE: { async send(event: typeof events[number]) { events.push(event); } },
  }));
  const body = await response.json() as {
    error: { code: string; detail: { stage: string; reason: string; internal_code: string } };
  };
  assert.equal(response.status, 502);
  assert.equal(body.error.code, "UPSTREAM_ERROR");
  assert.deepEqual(body.error.detail, {
    stage: "retrieval",
    reason: "failure",
    internal_code: "AI_SEARCH_FAILED",
  });
  assert.equal(events[0].interaction.failureCode, "AI_SEARCH_FAILED");
});

test("retrieval timeouts expose protocol-shaped upstream diagnostics", async (t) => {
  t.mock.method(AbortSignal, "timeout", (milliseconds: number) => {
    const controller = new AbortController();
    if (milliseconds >= 14_000 && milliseconds <= 15_000) queueMicrotask(() => controller.abort());
    return controller.signal;
  });
  const events: Array<{ interaction: { failureCode: string } }> = [];
  const response = await handleAsk(new Request("https://ask.refined-x.com/ask", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.7" },
    body: JSON.stringify({ query: { text: "x" }, prefer: { mode: "list" } }),
  }), acceptedEnv({
    PUBLIC_CONTENT: { async search() { return new Promise(() => {}); } },
    LEARNING_QUEUE: { async send(event: typeof events[number]) { events.push(event); } },
  }));
  const body = await response.json() as {
    error: { code: string; detail: { stage: string; reason: string; internal_code: string } };
  };
  assert.equal(response.status, 504);
  assert.equal(body.error.code, "UPSTREAM_TIMEOUT");
  assert.deepEqual(body.error.detail, {
    stage: "retrieval",
    reason: "timeout",
    internal_code: "AI_SEARCH_TIMEOUT",
  });
  assert.equal(events[0].interaction.failureCode, "AI_SEARCH_TIMEOUT");
});

test("model failures expose protocol-shaped upstream diagnostics", async (t) => {
  let externalCalls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    externalCalls += 1;
    return externalCalls === 1
      ? Response.json({ success: true, hostname: "refined-x.com", action: "public-ask" })
      : Response.json({}, { status: 503 });
  });
  const events: Array<{ interaction: { failureCode: string } }> = [];
  const response = await handleAsk(new Request("https://ask.refined-x.com/ask", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "cf-connecting-ip": "203.0.113.7",
      "cf-turnstile-response": "valid-token",
    },
    body: JSON.stringify({ query: { text: "x" }, prefer: { mode: "summarize" } }),
  }), acceptedEnv({
    PUBLIC_CONTENT: {
      async search() {
        return { chunks: [{ id: "chunk", score: 1, text: "evidence", item: { key: "/evidence" } }] };
      },
    },
    LEARNING_QUEUE: { async send(event: typeof events[number]) { events.push(event); } },
  }));
  const body = await response.json() as {
    error: { code: string; detail: { stage: string; reason: string; internal_code: string } };
  };
  assert.equal(response.status, 502);
  assert.equal(body.error.code, "UPSTREAM_ERROR");
  assert.deepEqual(body.error.detail, {
    stage: "model",
    reason: "failure",
    internal_code: "MODEL_FAILED",
  });
  assert.equal(externalCalls, 2);
  assert.equal(events[0].interaction.failureCode, "MODEL_FAILED");
});

test("model timeouts expose protocol-shaped upstream diagnostics", async (t) => {
  t.mock.method(AbortSignal, "timeout", (milliseconds: number) => {
    const controller = new AbortController();
    if (milliseconds >= 9_000 && milliseconds <= 10_000) queueMicrotask(() => controller.abort());
    return controller.signal;
  });
  let externalCalls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    externalCalls += 1;
    return externalCalls === 1
      ? Response.json({ success: true, hostname: "refined-x.com", action: "public-ask" })
      : new Promise(() => {});
  });
  const events: Array<{ interaction: { failureCode: string } }> = [];
  const response = await handleAsk(new Request("https://ask.refined-x.com/ask", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "cf-connecting-ip": "203.0.113.7",
      "cf-turnstile-response": "valid-token",
    },
    body: JSON.stringify({ query: { text: "x" }, prefer: { mode: "summarize" } }),
  }), acceptedEnv({
    PUBLIC_CONTENT: {
      async search() {
        return { chunks: [{ id: "chunk", score: 1, text: "evidence", item: { key: "/evidence" } }] };
      },
    },
    LEARNING_QUEUE: { async send(event: typeof events[number]) { events.push(event); } },
  }));
  const body = await response.json() as {
    error: { code: string; detail: { stage: string; reason: string; internal_code: string } };
  };
  assert.equal(response.status, 504);
  assert.equal(body.error.code, "UPSTREAM_TIMEOUT");
  assert.deepEqual(body.error.detail, {
    stage: "model",
    reason: "timeout",
    internal_code: "MODEL_TIMEOUT",
  });
  assert.equal(externalCalls, 2);
  assert.equal(events[0].interaction.failureCode, "MODEL_TIMEOUT");
});
