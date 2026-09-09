import assert from "node:assert/strict";
import test from "node:test";
import { digestApiKeySecret } from "./api-keys.ts";
import { ASK_TOOL_INPUT_SCHEMA, handleMcp } from "./mcp-server.ts";
import type { SecurityAuditEvent } from "./durable-events.ts";

function acceptedEnv(overrides: Record<string, unknown> = {}) {
  return {
    ACTOR_HMAC_KEY: "test-secret",
    TURNSTILE_SECRET_KEY: "turnstile-secret",
    ALLOWED_ORIGIN: "https://refined-x.com",
    PUBLIC_MCP_ORIGIN: "https://ask.refined-x.com",
    DAILY_REQUEST_LIMIT: "1000",
    DAILY_GENERATION_LIMIT: "200",
    SITE_URL: "https://refined-x.com",
    DEFAULT_LANGUAGE: "zh-CN",
    DEEPSEEK_MODEL: "test-model",
    ASK_RATE_LIMITER: { async limit() { return { success: true }; } },
    BROWSER_RATE_LIMITER: { async limit() { return { success: true }; } },
    KEY_RATE_LIMITER: { async limit() { return { success: true }; } },
    DB: {
      prepare() {
        return {
          bind() { return this; },
          async first() { return { accepted_count: 1 }; },
          async run() {},
        };
      },
    },
    PUBLIC_CONTENT: { async search() { return { chunks: [] }; } },
    LEARNING_QUEUE: { async send() {} },
    ...overrides,
  } as unknown as Env;
}

function mcpRequest(body: unknown, headers: HeadersInit = {}) {
  return new Request("https://ask.refined-x.com/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      host: "ask.refined-x.com",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function parseSseFinalJson(text: string): unknown {
  const matches = [...text.matchAll(/^data:\s*(.+)$/gm)].map((m) => m[1]);
  assert.ok(matches.length > 0, `expected SSE data events, got: ${text.slice(0, 200)}`);
  return JSON.parse(matches.at(-1)!);
}

async function readMcp(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();
  const body = (
    contentType.includes("text/event-stream") ? parseSseFinalJson(text) : JSON.parse(text || "null")
  ) as {
    result?: {
      protocolVersion?: string;
      serverInfo?: { name: string };
      tools?: Array<{
        name: string;
        description: string;
        inputSchema: typeof ASK_TOOL_INPUT_SCHEMA;
      }>;
      isError?: boolean;
      content?: Array<{ type: string; text: string }>;
      structuredContent?: {
        _meta?: { request_id: string; version: string; response_type: string };
        results?: unknown[];
      };
    };
    error?: { code: number | string; message?: string };
  };
  return { status: response.status, body, headers: response.headers, text };
}

function toolErrorPayload(body: { result?: { content?: Array<{ text: string }> } }) {
  const text = body.result?.content?.[0]?.text;
  assert.ok(text, "expected tool error content");
  return JSON.parse(text) as { error: { code: string; message: string } };
}

test("MCP POST /mcp initialize returns negotiated legacy capabilities", async () => {
  const env = acceptedEnv();
  const response = await handleMcp(mcpRequest({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "test", version: "1" },
    },
  }), env);
  const { status, body } = await readMcp(response);
  assert.equal(status, 200);
  assert.equal(body.result?.protocolVersion, "2025-11-25");
  assert.equal(body.result?.serverInfo?.name, "public-ask-worker");
});

test("MCP POST /mcp tools/list returns the ask tool schema", async () => {
  const env = acceptedEnv();
  const response = await handleMcp(mcpRequest({
    jsonrpc: "2.0", id: 2, method: "tools/list", params: {},
  }), env);
  const { status, body } = await readMcp(response);
  assert.equal(status, 200);
  assert.equal(body.result?.tools?.[0]?.name, "ask");
  assert.match(body.result!.tools![0].description, /restricted \/ask subset/);
  assert.match(body.result!.tools![0].description, /Does not support \/await/);
  assert.match(body.result!.tools![0].description, /long-term memory/);
  assert.equal(body.result!.tools![0].inputSchema.additionalProperties, false);
  assert.match(body.result!.tools![0].inputSchema.description, /arbitrary extension fields/);
  assert.equal(body.result!.tools![0].inputSchema.properties.query.additionalProperties, false);
  assert.equal(body.result!.tools![0].inputSchema.properties.context.maxProperties, 0);
  assert.equal(body.result!.tools![0].inputSchema.properties.prefer.additionalProperties, false);
  assert.equal(body.result!.tools![0].inputSchema.properties.prefer.properties.mode.type, "string");
  assert.equal("enum" in body.result!.tools![0].inputSchema.properties.prefer.properties.mode, false);
  assert.deepEqual(body.result!.tools![0].inputSchema.properties.prefer.properties.mode.examples, [
    "list",
    "summarize",
    "list, summarize",
  ]);
  assert.equal(body.result!.tools![0].inputSchema.properties.prefer.properties.response_format.const, "conversational_search");
  assert.equal(body.result!.tools![0].inputSchema.properties.meta.additionalProperties, false);
  assert.equal(body.result!.tools![0].inputSchema.properties.prefer.properties.streaming.type, "boolean");
  assert.equal(body.result!.tools![0].inputSchema.properties.meta.properties.version.const, "0.55");
});

test("MCP POST /mcp tools/call executes ask in list mode", async () => {
  let searchCalls = 0;
  const env = acceptedEnv({
    PUBLIC_CONTENT: { async search() { searchCalls += 1; return { chunks: [] }; } },
  });
  const response = await handleMcp(mcpRequest({
    jsonrpc: "2.0", id: 3, method: "tools/call",
    params: { name: "ask", arguments: { query: { text: "test" } } },
  }, { "cf-connecting-ip": "203.0.113.7" }), env);
  const { status, body } = await readMcp(response);
  assert.equal(status, 200);
  assert.equal(searchCalls, 1);
  assert.equal(body.result?.isError, undefined);
  assert.equal(body.result?.content?.length, 1);
  assert.equal(body.result!.content![0].type, "text");
  const nlweb = JSON.parse(body.result!.content![0].text) as {
    _meta: { request_id: string; version: string; response_type: string };
    results: unknown[];
  };
  assert.equal(nlweb._meta.response_type, "answer");
  assert.equal(nlweb._meta.version, "0.55");
  assert.ok(nlweb._meta.request_id);
  assert.deepEqual(nlweb.results, []);
  assert.deepEqual(body.result?.structuredContent?.results, []);
});

test("MCP POST /mcp tools/call treats empty prefer.mode as list without summarize auth", async () => {
  let searchCalls = 0;
  let browserRateCalls = 0;
  const env = acceptedEnv({
    PUBLIC_CONTENT: { async search() { searchCalls += 1; return { chunks: [] }; } },
    BROWSER_RATE_LIMITER: { async limit() { browserRateCalls += 1; return { success: true }; } },
  });
  const response = await handleMcp(mcpRequest({
    jsonrpc: "2.0", id: 31, method: "tools/call",
    params: { name: "ask", arguments: { query: { text: "test" }, prefer: { mode: "" } } },
  }, { "cf-connecting-ip": "203.0.113.7" }), env);
  const { status, body } = await readMcp(response);
  assert.equal(status, 200);
  assert.equal(body.error, undefined);
  assert.equal(body.result?.isError, undefined);
  assert.equal(searchCalls, 1);
  assert.equal(browserRateCalls, 0);
  const nlweb = JSON.parse(body.result!.content![0].text) as {
    _meta: { response_type: string };
    results: unknown[];
  };
  assert.equal(nlweb._meta.response_type, "answer");
  assert.deepEqual(nlweb.results, []);
});

test("MCP POST /mcp tools/call rejects summarize mode without API key with 403 tool error", async () => {
  const audits: SecurityAuditEvent[] = [];
  const env = acceptedEnv({
    LEARNING_QUEUE: {
      async send(event: SecurityAuditEvent) {
        audits.push(event);
      },
    },
  });
  const response = await handleMcp(mcpRequest({
    jsonrpc: "2.0", id: 4, method: "tools/call",
    params: {
      name: "ask",
      arguments: {
        query: { text: "test" },
        prefer: { mode: "summarize", "accept-language": "en-US" },
      },
    },
  }, { "cf-connecting-ip": "203.0.113.7" }), env);
  const { status, body } = await readMcp(response);
  assert.equal(status, 403);
  assert.equal(body.result?.isError, true);
  const err = toolErrorPayload(body);
  assert.equal(err.error.code, "FORBIDDEN");
  assert.match(err.error.message, /generate summaries/i);
  assert.equal(typeof body.error?.code === "string", false);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].securityAudit.route, "/mcp");
  assert.equal(audits[0].securityAudit.reasonCode, "MODE_FORBIDDEN");
});

test("MCP POST /mcp tools/call rejects non-string prefer.mode as tool input error", async () => {
  const env = acceptedEnv();
  const response = await handleMcp(mcpRequest({
    jsonrpc: "2.0", id: 5, method: "tools/call",
    params: { name: "ask", arguments: { query: { text: "test" }, prefer: { mode: ["summarize"] } } },
  }, { "cf-connecting-ip": "203.0.113.7" }), env);
  const { status, body } = await readMcp(response);
  assert.equal(status, 200);
  assert.equal(body.result?.isError, true);
  assert.equal(body.error, undefined);
});

test("MCP POST /mcp tools/call executes summarize with a trusted API key", async (t) => {
  const keyId = "abcdefghijklmnop";
  const secret = "A".repeat(43);
  const secretDigest = await digestApiKeySecret(secret);
  let browserRateCalls = 0;
  let externalCalls = 0;
  const events: Array<{ interaction: { accessClass: string; actorId: string | null; keyId: string | null } }> = [];
  t.mock.method(globalThis, "fetch", async () => {
    externalCalls += 1;
    return Response.json({ choices: [{ message: { content: "machine answer" } }] });
  });
  const env = acceptedEnv({
    KEY_RATE_LIMITER: { async limit() { return { success: true }; } },
    BROWSER_RATE_LIMITER: { async limit() { browserRateCalls += 1; return { success: true }; } },
    DB: {
      prepare(sql: string) {
        return {
          bind() {
            return {
              async first() {
                if (sql.includes("public_ask_api_keys")) {
                  return {
                    key_id: keyId,
                    secret_digest: secretDigest,
                    name: "partner",
                    status: "active",
                    allowed_modes: '["list","summarize"]',
                    daily_limit: 25,
                  };
                }
                if (sql.includes("public_ask_key_usage")) return { accepted_requests: 1 };
                if (sql.includes("generation_reserved")) return { generation_reserved: 1 };
                return { accepted_requests: 1 };
              },
              async run() {},
            };
          },
        };
      },
    },
    PUBLIC_CONTENT: {
      async search() {
        return { chunks: [{ id: "chunk", score: 1, text: "evidence", item: { key: "/evidence" } }] };
      },
    },
    LEARNING_QUEUE: { async send(event: typeof events[number]) { events.push(event); } },
  });
  const response = await handleMcp(mcpRequest({
    jsonrpc: "2.0", id: 6, method: "tools/call",
    params: { name: "ask", arguments: { query: { text: "test" }, prefer: { mode: "summarize" } } },
  }, {
    "cf-connecting-ip": "203.0.113.7",
    authorization: `Bearer pask_${keyId}_${secret}`,
  }), env);
  const { status, body } = await readMcp(response);
  assert.equal(status, 200);
  assert.equal(externalCalls, 1);
  assert.equal(browserRateCalls, 0);
  assert.equal(events[0].interaction.accessClass, "trusted_machine");
  assert.equal(events[0].interaction.actorId, null);
  assert.equal(events[0].interaction.keyId, keyId);
  const nlweb = JSON.parse(body.result!.content![0].text) as {
    _meta: { request_id: string };
    results: Array<{ "@type": string; text?: string }>;
  };
  assert.ok(nlweb._meta.request_id);
  assert.ok(nlweb.results.some((item) => item["@type"] === "SearchSummary" && item.text?.includes("machine answer")));
});

test("MCP legacy notifications/initialized returns 202 empty", async () => {
  const env = acceptedEnv();
  const response = await handleMcp(mcpRequest({
    jsonrpc: "2.0",
    method: "notifications/initialized",
  }), env);
  assert.equal(response.status, 202);
  assert.equal(await response.text(), "");
});

test("MCP rejects missing PUBLIC_MCP_ORIGIN without running tools", async () => {
  let searchCalls = 0;
  const env = acceptedEnv({
    PUBLIC_MCP_ORIGIN: undefined,
    PUBLIC_CONTENT: { async search() { searchCalls += 1; return { chunks: [] }; } },
  });
  const response = await handleMcp(mcpRequest({
    jsonrpc: "2.0", id: 1, method: "tools/call",
    params: { name: "ask", arguments: { query: { text: "x" } } },
  }), env);
  assert.equal(response.status, 503);
  assert.equal(searchCalls, 0);
});

test("MCP OPTIONS allows MCP headers for allowed origin and rejects others", async () => {
  const env = acceptedEnv();
  const ok = await handleMcp(new Request("https://ask.refined-x.com/mcp", {
    method: "OPTIONS",
    headers: { origin: "https://refined-x.com", host: "ask.refined-x.com" },
  }), env);
  assert.equal(ok.status, 204);
  assert.equal(ok.headers.get("access-control-allow-origin"), "https://refined-x.com");
  assert.match(ok.headers.get("access-control-allow-headers") ?? "", /mcp-protocol-version/);

  const denied = await handleMcp(new Request("https://ask.refined-x.com/mcp", {
    method: "OPTIONS",
    headers: { origin: "https://evil.example", host: "ask.refined-x.com" },
  }), env);
  assert.equal(denied.status, 403);
});

test("MCP oversize body returns 413 without tool execution", async () => {
  let searchCalls = 0;
  const env = acceptedEnv({
    PUBLIC_CONTENT: { async search() { searchCalls += 1; return { chunks: [] }; } },
  });
  const oversize = "x".repeat(17 * 1024);
  const response = await handleMcp(mcpRequest({
    jsonrpc: "2.0", id: 1, method: "tools/call",
    params: { name: "ask", arguments: { query: { text: oversize } } },
  }), env);
  assert.equal(response.status, 413);
  assert.equal(searchCalls, 0);
});

test("MCP rejects Host that does not match PUBLIC_MCP_ORIGIN", async () => {
  let searchCalls = 0;
  const env = acceptedEnv({
    PUBLIC_CONTENT: { async search() { searchCalls += 1; return { chunks: [] }; } },
  });
  const response = await handleMcp(mcpRequest({
    jsonrpc: "2.0", id: 1, method: "tools/list", params: {},
  }, { host: "evil.example" }), env);
  assert.equal(response.status, 403);
  assert.equal(searchCalls, 0);
});
