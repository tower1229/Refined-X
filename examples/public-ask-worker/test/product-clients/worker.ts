/**
 * Acceptance Worker: same mocked bindings as mcp-protocol integration,
 * plus /trace for product-client evidence (observed methods / protocol headers).
 */
import { digestApiKeySecret } from "../../src/api-keys.ts";
import { handleMcp } from "../../src/mcp-server.ts";
import {
  ALLOWED_ORIGIN,
  LIST_ONLY_KEY_ID,
  LIST_ONLY_SECRET,
  PUBLIC_MCP_ORIGIN,
  TRUSTED_KEY_ID,
  TRUSTED_SECRET,
} from "../mcp-protocol/fixtures.ts";
import { interpretToolsCallBody } from "./tools-call-body.ts";

type TraceEntry = {
  at: string;
  method: string;
  mcpProtocolVersion: string | null;
  mcpMethod: string | null;
  mcpName: string | null;
  jsonRpcMethod: string | null;
  authorizationPresent: boolean;
  status: number;
  /** tools/call only: MCP tool result isError; null when not applicable / unparsed. */
  toolIsError: boolean | null;
};

async function extractToolIsError(
  response: Response,
  jsonRpcMethod: string | null,
): Promise<boolean | null> {
  if (jsonRpcMethod !== "tools/call") return null;
  try {
    const text = await response.clone().text();
    return interpretToolsCallBody(text, response.headers.get("content-type"));
  } catch {
    return null;
  }
}

const counters = { searchCalls: 0 };
const trace: TraceEntry[] = [];
const digestCache = new Map<string, Promise<string>>();

function digestOf(secret: string): Promise<string> {
  let pending = digestCache.get(secret);
  if (!pending) {
    pending = digestApiKeySecret(secret);
    digestCache.set(secret, pending);
  }
  return pending;
}

function createEnv(): Env {
  return {
    ACTOR_HMAC_KEY: "integration-secret",
    TURNSTILE_SECRET_KEY: "turnstile-secret",
    ALLOWED_ORIGIN,
    PUBLIC_MCP_ORIGIN,
    DAILY_REQUEST_LIMIT: "1000",
    DAILY_GENERATION_LIMIT: "200",
    SITE_URL: "https://site.integration.local",
    DEFAULT_LANGUAGE: "en",
    DEEPSEEK_MODEL: "test-model",
    DEEPSEEK_API_KEY: "test-key",
    ASK_RATE_LIMITER: {
      async limit() {
        return { success: true };
      },
    },
    BROWSER_RATE_LIMITER: { async limit() { return { success: true }; } },
    KEY_RATE_LIMITER: { async limit() { return { success: true }; } },
    DB: {
      prepare(sql: string) {
        return {
          bind(...values: unknown[]) {
            const keyId = typeof values[0] === "string" ? values[0] : "";
            return {
              async first() {
                if (sql.includes("public_ask_api_keys")) {
                  if (keyId === LIST_ONLY_KEY_ID) {
                    return {
                      key_id: LIST_ONLY_KEY_ID,
                      secret_digest: await digestOf(LIST_ONLY_SECRET),
                      name: "list-only",
                      status: "active",
                      allowed_modes: '["list"]',
                      daily_limit: 25,
                    };
                  }
                  return {
                    key_id: TRUSTED_KEY_ID,
                    secret_digest: await digestOf(TRUSTED_SECRET),
                    name: "partner",
                    status: "active",
                    allowed_modes: '["list","summarize"]',
                    daily_limit: 25,
                  };
                }
                if (sql.includes("temporary_blocks") || sql.includes("manual_blocks")) {
                  return null;
                }
                return { accepted_count: 1, accepted_requests: 1, generation_reserved: 1 };
              },
              async run() {},
            };
          },
        };
      },
    },
    PUBLIC_CONTENT: {
      async search() {
        counters.searchCalls += 1;
        // Empty retrieval keeps summarize on the no-reference path (no real model),
        // matching mcp-protocol integration; still proves Key/mode auth + list retrieval.
        return { chunks: [] };
      },
    },
    LEARNING_QUEUE: { async send() {} },
  } as unknown as Env;
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return Response.json({ searchCalls: counters.searchCalls, ok: true });
    }
    if (url.pathname === "/reset") {
      counters.searchCalls = 0;
      trace.length = 0;
      return Response.json({ ok: true });
    }
    if (url.pathname === "/trace") {
      return Response.json({ searchCalls: counters.searchCalls, trace });
    }
    if (url.pathname === "/mcp") {
      const rawBody = request.method === "POST" ? await request.text() : "";
      let jsonRpcMethod: string | null = null;
      if (rawBody) {
        try {
          const parsed = JSON.parse(rawBody) as { method?: unknown };
          if (typeof parsed.method === "string") jsonRpcMethod = parsed.method;
        } catch {
          jsonRpcMethod = null;
        }
      }
      const proxied = rawBody
        ? new Request(request.url, {
            method: request.method,
            headers: request.headers,
            body: rawBody,
          })
        : request;
      const response = await handleMcp(proxied, createEnv());
      const toolIsError = await extractToolIsError(response, jsonRpcMethod);
      trace.push({
        at: new Date().toISOString(),
        method: request.method,
        mcpProtocolVersion: request.headers.get("mcp-protocol-version"),
        mcpMethod: request.headers.get("mcp-method"),
        mcpName: request.headers.get("mcp-name"),
        jsonRpcMethod,
        authorizationPresent: Boolean(request.headers.get("authorization")),
        status: response.status,
        toolIsError,
      });
      return response;
    }
    return new Response("not found", { status: 404 });
  },
};
