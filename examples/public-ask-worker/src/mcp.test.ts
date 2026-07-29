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

test("MCP POST /mcp initialize returns valid server capabilities", async () => {
  const env = acceptedEnv();
  const response = await handleMcp(new Request("https://ask.refined-x.com/mcp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
  }), env);
  const body = await response.json() as { result: { serverInfo: { name: string } } };
  assert.equal(response.status, 200);
  assert.equal(body.result.serverInfo.name, "public-ask-worker");
});

test("MCP POST /mcp tools/list returns the ask tool schema", async () => {
  const env = acceptedEnv();
  const response = await handleMcp(new Request("https://ask.refined-x.com/mcp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
  }), env);
  const body = await response.json() as {
    result: {
      tools: Array<{
        name: string;
        description: string;
        inputSchema: typeof ASK_TOOL_INPUT_SCHEMA;
      }>;
    };
  };
  assert.equal(response.status, 200);
  assert.equal(body.result.tools[0].name, "ask");
  assert.match(body.result.tools[0].description, /restricted \/ask subset/);
  assert.match(body.result.tools[0].description, /Does not support \/await/);
  assert.match(body.result.tools[0].description, /long-term memory/);
  assert.deepEqual(body.result.tools[0].inputSchema, ASK_TOOL_INPUT_SCHEMA);
  assert.equal(body.result.tools[0].inputSchema.additionalProperties, false);
  assert.match(body.result.tools[0].inputSchema.description, /arbitrary extension fields/);
  assert.equal(body.result.tools[0].inputSchema.properties.query.additionalProperties, false);
  assert.equal(body.result.tools[0].inputSchema.properties.context.maxProperties, 0);
  assert.equal(body.result.tools[0].inputSchema.properties.prefer.additionalProperties, false);
  assert.deepEqual(body.result.tools[0].inputSchema.properties.prefer.properties.mode.enum, ["list", "summarize", "list, summarize"]);
  assert.equal(body.result.tools[0].inputSchema.properties.prefer.properties.response_format.const, "conversational_search");
  assert.equal(body.result.tools[0].inputSchema.properties.meta.additionalProperties, false);
  assert.equal(body.result.tools[0].inputSchema.properties.prefer.properties.streaming.type, "boolean");
  assert.equal(body.result.tools[0].inputSchema.properties.meta.properties.version.const, "0.55");
});

test("MCP POST /mcp tools/call executes ask in list mode", async () => {
  let searchCalls = 0;
  const env = acceptedEnv({
    PUBLIC_CONTENT: { async search() { searchCalls += 1; return { chunks: [] }; } },
  });
  const response = await handleMcp(new Request("https://ask.refined-x.com/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.7" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 3, method: "tools/call",
      params: { name: "ask", arguments: { query: { text: "test" } } }
    }),
  }), env);
  const body = await response.json() as { result: { content: Array<{ type: string, text: string }> } };
  assert.equal(response.status, 200);
  assert.equal(searchCalls, 1);
  assert.equal(body.result.content.length, 1);
  assert.equal(body.result.content[0].type, "text");
  const nlweb = JSON.parse(body.result.content[0].text) as {
    _meta: { request_id: string; version: string; response_type: string };
    results: unknown[];
  };
  assert.equal(nlweb._meta.response_type, "answer");
  assert.equal(nlweb._meta.version, "0.55");
  assert.ok(nlweb._meta.request_id);
  assert.deepEqual(nlweb.results, []);
});

test("MCP POST /mcp tools/call rejects summarize mode without API key with 403", async () => {
  const audits: SecurityAuditEvent[] = [];
  const env = acceptedEnv({
    LEARNING_QUEUE: {
      async send(event: SecurityAuditEvent) {
        audits.push(event);
      },
    },
  });
  const response = await handleMcp(new Request("https://ask.refined-x.com/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.7" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 4, method: "tools/call",
      params: {
        name: "ask",
        arguments: {
          query: { text: "test" },
          prefer: { mode: "summarize", "accept-language": "en-US" },
        },
      }
    }),
  }), env);
  const body = await response.json() as { error: { code: string; message: string } };
  assert.equal(response.status, 403);
  assert.equal(body.error.code, "FORBIDDEN");
  assert.match(body.error.message, /generate summaries/i);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].securityAudit.route, "/mcp");
  assert.equal(audits[0].securityAudit.reasonCode, "MODE_FORBIDDEN");
});

test("MCP POST /mcp tools/call rejects non-string prefer.mode before summarize handling", async () => {
  const env = acceptedEnv();
  const response = await handleMcp(new Request("https://ask.refined-x.com/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.7" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 5, method: "tools/call",
      params: { name: "ask", arguments: { query: { text: "test" }, prefer: { mode: ["summarize"] } } }
    }),
  }), env);
  const body = await response.json() as { error: { code: number; message: string } };
  assert.equal(response.status, 200);
  assert.equal(body.error.code, -32602);
  assert.match(body.error.message, /prefer\.mode must be a string/i);
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
  const response = await handleMcp(new Request("https://ask.refined-x.com/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "cf-connecting-ip": "203.0.113.7",
      authorization: `Bearer pask_${keyId}_${secret}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 6, method: "tools/call",
      params: { name: "ask", arguments: { query: { text: "test" }, prefer: { mode: "summarize" } } },
    }),
  }), env);
  const body = await response.json() as { result: { content: Array<{ type: string; text: string }> } };
  assert.equal(response.status, 200);
  assert.equal(externalCalls, 1);
  assert.equal(browserRateCalls, 0);
  assert.equal(events[0].interaction.accessClass, "trusted_machine");
  assert.equal(events[0].interaction.actorId, null);
  assert.equal(events[0].interaction.keyId, keyId);
  const nlweb = JSON.parse(body.result.content[0].text) as {
    _meta: { request_id: string };
    results: Array<{ "@type": string; text?: string }>;
  };
  assert.ok(nlweb._meta.request_id);
  assert.ok(nlweb.results.some((item) => item["@type"] === "SearchSummary" && item.text?.includes("machine answer")));
});
