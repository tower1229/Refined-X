import { AsyncLocalStorage } from "node:async_hooks";
import {
  createMcpHandler,
  fromJsonSchema,
  isJsonContentType,
  McpServer,
  type McpRequestContext,
} from "@modelcontextprotocol/server";
import { CfWorkerJsonSchemaValidator } from "@modelcontextprotocol/server/validators/cf-worker";
import {
  ASK_RAW_INPUT_SCHEMA,
  ASK_SUCCESS_RESULT_SCHEMA,
  PUBLIC_ASK_CAPABILITY,
  PUBLIC_ASK_UNSUPPORTED,
  type NlWebRequest,
  type NlWebSuccessBody,
} from "../../../shared/public-ask-contract.ts";
import {
  type AskActionContext,
  type AskRuntime,
  executeAskAction,
} from "./ask-service.ts";
import type { RejectionPayload } from "./abuse-guard.ts";
import { resolveInstancePolicy } from "./instance-policy.ts";
import { runPreAuthChecks } from "./pre-auth.ts";
import {
  answerMeta,
  fitResponseResults,
  normalizeAskRequest,
  RequestProblem,
} from "./protocol.ts";
import { MAX_REQUEST_BYTES } from "./request-envelope.ts";

export const ASK_TOOL_INPUT_SCHEMA = ASK_RAW_INPUT_SCHEMA;

export const MAX_MCP_REQUEST_BYTES = MAX_REQUEST_BYTES;
export const MAX_MCP_RESPONSE_BYTES = 128 * 1024;
/** Inner NLWeb payload budget before structuredContent + text + RPC/SSE wrap. */
export const MCP_INNER_RESULT_BUDGET = 96 * 1024;

const ASK_TOOL_DESCRIPTION = `Ask a natural language question through the ${PUBLIC_ASK_CAPABILITY}. ${PUBLIC_ASK_UNSUPPORTED}`;
const MCP_SERVER_INFO = { name: "public-ask-worker", version: "1.0.0" } as const;
const PUBLIC_TOOL_CACHE_TTL_MS = 3_600_000;
const BEARER_CHALLENGE = 'Bearer realm="public-ask"';

const CORS_ALLOW_HEADERS = [
  "content-type",
  "authorization",
  "accept",
  "mcp-protocol-version",
  "mcp-method",
  "mcp-name",
  "cf-turnstile-response",
].join(", ");

export type McpHttpOutcome = {
  status: number;
  retryAfter?: number;
};

type McpRequestStore = {
  env: Env;
  runtime: AskRuntime;
  requestId: string;
  remoteIp: string;
  authorization: string | null;
  signal: AbortSignal;
  outcome: McpHttpOutcome;
};

const mcpStore = new AsyncLocalStorage<McpRequestStore>();
const jsonSchemaValidator = new CfWorkerJsonSchemaValidator();

// fromJsonSchema expects a mutable JsonSchema object; shared contract schemas are `as const`.
const askInputSchema = fromJsonSchema<NlWebRequest>(
  ASK_RAW_INPUT_SCHEMA as unknown as Record<string, unknown>,
  jsonSchemaValidator,
);

const askOutputSchema = fromJsonSchema<NlWebSuccessBody>(
  ASK_SUCCESS_RESULT_SCHEMA as unknown as Record<string, unknown>,
  jsonSchemaValidator,
);

function createAskServer(_ctx: McpRequestContext): McpServer {
  const store = mcpStore.getStore();
  if (!store) {
    throw new Error("MCP ask factory invoked outside request store");
  }

  const server = new McpServer(MCP_SERVER_INFO, {
    jsonSchemaValidator,
    cacheHints: {
      "tools/list": { ttlMs: PUBLIC_TOOL_CACHE_TTL_MS, cacheScope: "public" },
      "server/discover": { ttlMs: PUBLIC_TOOL_CACHE_TTL_MS, cacheScope: "public" },
    },
  });

  server.registerTool(
    "ask",
    {
      title: "Ask",
      description: ASK_TOOL_DESCRIPTION,
      inputSchema: askInputSchema,
      outputSchema: askOutputSchema,
      annotations: {
        readOnlyHint: true,
        openWorldHint: false,
      },
    },
    async (args) => runAskTool(args, store),
  );

  return server;
}

const sdkHandler = createMcpHandler(createAskServer, {
  legacy: "stateless",
  responseMode: "json",
});

function toolError(code: string, message: string, detail?: Record<string, unknown>) {
  return {
    isError: true as const,
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        error: detail === undefined ? { code, message } : { code, message, data: detail },
      }),
    }],
  };
}

async function runAskTool(args: unknown, store: McpRequestStore) {
  store.outcome.status = 200;
  store.outcome.retryAfter = undefined;

  let parsed: NlWebRequest;
  try {
    parsed = normalizeAskRequest(args, "mcp");
  } catch (error) {
    if (error instanceof RequestProblem) {
      return toolError(error.code, error.message);
    }
    return toolError("INVALID_QUERY", error instanceof Error ? error.message : "Invalid params");
  }

  const context: AskActionContext = {
    requestId: store.requestId,
    createdAt: new Date().toISOString(),
    method: "POST",
    route: "/mcp",
    remoteIp: store.remoteIp,
    authorization: store.authorization,
    turnstileToken: null,
    preAuthCompleted: true,
    payloadProvider: async () => parsed,
    signal: store.signal,
  };

  const result = await executeAskAction(context, store.env, store.runtime);
  if (!result.ok) {
    store.outcome.status = result.status;
    if (result.retryAfter !== undefined) {
      store.outcome.retryAfter = result.retryAfter;
    }
    return toolError(result.code, result.message, result.detail);
  }

  let fittedResults = result.results;
  try {
    fittedResults = fitResponseResults(store.requestId, result.results, MCP_INNER_RESULT_BUDGET);
  } catch {
    return toolError("RESPONSE_TOO_LARGE", "bounded");
  }

  const nlwebResponse: NlWebSuccessBody = {
    _meta: answerMeta(store.requestId, result.streaming),
    results: fittedResults,
  };
  const text = JSON.stringify(nlwebResponse);
  return {
    content: [{ type: "text" as const, text }],
    structuredContent: nlwebResponse,
  };
}

/**
 * Resolve the Worker Host allowlist hostname from PUBLIC_MCP_ORIGIN.
 * Missing/illegal config fails closed for /mcp.
 */
export function resolvePublicMcpHostname(env: Pick<Env, "PUBLIC_MCP_ORIGIN">): string | null {
  const raw = env.PUBLIC_MCP_ORIGIN?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password || url.search || url.hash) return null;
    if (url.pathname !== "/" && url.pathname !== "") return null;
    if (url.protocol === "http:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
      return null;
    }
    return url.hostname.toLowerCase();
  } catch {
    return null;
  }
}

function hostAllowed(requestHost: string, allowedHostname: string): boolean {
  const host = requestHost.split(":")[0]?.toLowerCase() ?? "";
  if (!host) return false;
  if (host === allowedHostname) return true;
  // Local wrangler / Node harness exception (plan §9.4).
  return host === "127.0.0.1" || host === "localhost";
}

function mcpCorsHeaders(origin: string | null, allowedOrigin: string): Headers {
  const headers = new Headers();
  headers.set("access-control-allow-headers", CORS_ALLOW_HEADERS);
  headers.set("access-control-expose-headers", "retry-after, www-authenticate, x-request-id");
  headers.set("vary", "origin");
  if (origin === allowedOrigin) {
    headers.set("access-control-allow-origin", origin);
    headers.set("access-control-allow-methods", "POST, OPTIONS");
  }
  return headers;
}

function withMcpHeaders(
  response: Response,
  origin: string | null,
  allowedOrigin: string,
  requestId: string,
  outcome?: McpHttpOutcome,
): Response {
  const headers = new Headers(response.headers);
  const cors = mcpCorsHeaders(origin, allowedOrigin);
  cors.forEach((value, key) => {
    headers.set(key, value);
  });
  headers.set("x-request-id", requestId);
  if (outcome?.retryAfter !== undefined) {
    headers.set("retry-after", String(outcome.retryAfter));
  }
  const status = outcome && outcome.status !== 200 ? outcome.status : response.status;
  if (status === 401 && !headers.has("www-authenticate")) {
    headers.set("www-authenticate", BEARER_CHALLENGE);
  }
  return new Response(response.body, { status, headers });
}

function securityBoundaryResponse(
  rejection: RejectionPayload,
  origin: string | null,
  allowedOrigin: string,
  requestId: string,
): Response {
  const headers = mcpCorsHeaders(origin, allowedOrigin);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("x-request-id", requestId);
  if (rejection.retryAfter !== undefined) {
    headers.set("retry-after", String(rejection.retryAfter));
  }
  if (rejection.status === 401) {
    headers.set("www-authenticate", BEARER_CHALLENGE);
  }
  return Response.json(
    { error: { code: rejection.code, message: rejection.message } },
    { status: rejection.status, headers },
  );
}

async function bufferResponse(response: Response): Promise<{
  status: number;
  headers: Headers;
  body: ArrayBuffer;
  byteLength: number;
}> {
  const body = await response.arrayBuffer();
  return {
    status: response.status,
    headers: new Headers(response.headers),
    body,
    byteLength: body.byteLength,
  };
}

export async function handleMcp(request: Request, env: Env, runtime: AskRuntime = {}): Promise<Response> {
  const origin = request.headers.get("origin");
  const allowedOrigin = env.ALLOWED_ORIGIN;
  const requestId = crypto.randomUUID();

  if (request.method === "OPTIONS") {
    if (origin && origin !== allowedOrigin) {
      return new Response("Forbidden", { status: 403 });
    }
    return withMcpHeaders(
      new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-methods": "POST, OPTIONS",
          "access-control-max-age": "86400",
        },
      }),
      origin,
      allowedOrigin,
      requestId,
    );
  }

  if (request.method !== "POST") {
    return withMcpHeaders(
      new Response("Method not allowed", { status: 405 }),
      origin,
      allowedOrigin,
      requestId,
    );
  }

  const publicHostname = resolvePublicMcpHostname(env);
  if (!publicHostname) {
    return withMcpHeaders(
      Response.json(
        { error: { code: "MISCONFIGURED", message: "PUBLIC_MCP_ORIGIN is missing or invalid" } },
        { status: 503, headers: { "content-type": "application/json; charset=utf-8" } },
      ),
      origin,
      allowedOrigin,
      requestId,
    );
  }

  const host = request.headers.get("host") ?? "";
  if (!hostAllowed(host, publicHostname)) {
    return withMcpHeaders(
      new Response("Forbidden host", { status: 403 }),
      origin,
      allowedOrigin,
      requestId,
    );
  }

  if (origin && origin !== allowedOrigin) {
    return withMcpHeaders(
      new Response("Forbidden origin", { status: 403 }),
      origin,
      allowedOrigin,
      requestId,
    );
  }

  if (!isJsonContentType(request.headers.get("content-type"))) {
    return withMcpHeaders(
      new Response("Unsupported Media Type", { status: 415 }),
      origin,
      allowedOrigin,
      requestId,
    );
  }

  let defaultLanguage: "en" | "zh-CN" = "en";
  try {
    defaultLanguage = resolveInstancePolicy(env).language;
  } catch {
    // pre-auth still needs a language; executeAskAction reports invalid config on tool calls.
  }

  const remoteIp = request.headers.get("cf-connecting-ip") ?? "unknown";
  const preAuth = await runPreAuthChecks(
    env,
    remoteIp,
    requestId,
    "/mcp",
    request.method,
    runtime,
    undefined,
    defaultLanguage,
  );
  if (!preAuth.ok) {
    return securityBoundaryResponse(preAuth.rejection, origin, allowedOrigin, requestId);
  }

  const raw = new Uint8Array(await request.arrayBuffer());
  if (raw.byteLength > MAX_MCP_REQUEST_BYTES) {
    return withMcpHeaders(
      new Response("Payload Too Large", { status: 413 }),
      origin,
      allowedOrigin,
      requestId,
    );
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    parsedBody = undefined;
  }

  const rebuilt = new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: raw,
    signal: request.signal,
  });

  const outcome: McpHttpOutcome = { status: 200 };
  const store: McpRequestStore = {
    env,
    runtime,
    requestId,
    remoteIp,
    authorization: request.headers.get("authorization"),
    signal: request.signal,
    outcome,
  };

  const sdkResponse = await mcpStore.run(store, () =>
    sdkHandler.fetch(rebuilt, parsedBody === undefined ? undefined : { parsedBody }),
  );

  const buffered = await bufferResponse(sdkResponse);
  if (buffered.byteLength > MAX_MCP_RESPONSE_BYTES) {
    return withMcpHeaders(
      Response.json(
        { error: { code: "RESPONSE_TOO_LARGE", message: "bounded" } },
        { status: 500, headers: { "content-type": "application/json; charset=utf-8" } },
      ),
      origin,
      allowedOrigin,
      requestId,
    );
  }

  return withMcpHeaders(
    new Response(buffered.body, { status: buffered.status, headers: buffered.headers }),
    origin,
    allowedOrigin,
    requestId,
    outcome,
  );
}
