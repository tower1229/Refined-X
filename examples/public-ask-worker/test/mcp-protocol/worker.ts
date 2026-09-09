/**
 * Thin workerd entry for production dual-era MCP protocol integration.
 * Uses real handleMcp + mocked bindings (no AI Search / model / production data).
 * Only the default export may be present — Wrangler treats named exports as handlers.
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
} from "./fixtures.ts";

type Counter = { searchCalls: number };

const counters: Counter = { searchCalls: 0 };

const digestCache = new Map<string, Promise<string>>();

function digestOf(secret: string): Promise<string> {
  let pending = digestCache.get(secret);
  if (!pending) {
    pending = digestApiKeySecret(secret);
    digestCache.set(secret, pending);
  }
  return pending;
}

function createEnv(options: { rateLimited?: boolean } = {}): Env {
  const rateOk = !options.rateLimited;
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
        return { success: rateOk };
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
      return Response.json({ searchCalls: counters.searchCalls });
    }
    if (url.pathname === "/reset") {
      counters.searchCalls = 0;
      return Response.json({ ok: true });
    }
    if (url.pathname === "/mcp") {
      const rateLimited = url.searchParams.get("preauth") === "rate-limited";
      return handleMcp(request, createEnv({ rateLimited }));
    }
    return new Response("not found", { status: 404 });
  },
};
