import { type AskRuntime, type AskActionContext, executeAskAction } from "./ask-service.ts";
import { answerMeta, normalizeAskRequest, type NlWebRequest } from "./protocol.ts";
import {
  ASK_RAW_INPUT_SCHEMA,
  PUBLIC_ASK_CAPABILITY,
  PUBLIC_ASK_UNSUPPORTED,
} from "../../../shared/public-ask-contract.ts";
import { runPreAuthChecks } from "./pre-auth.ts";
import { readJsonBody } from "./request-envelope.ts";
import { resolveInstancePolicy } from "./instance-policy.ts";

export const ASK_TOOL_INPUT_SCHEMA = ASK_RAW_INPUT_SCHEMA;

const ASK_TOOL_DESCRIPTION = `Ask a natural language question through the ${PUBLIC_ASK_CAPABILITY}. ${PUBLIC_ASK_UNSUPPORTED}`;

function jsonRpcError(id: string | number | null, code: number | string, message: string, status: number = 200, headers?: HeadersInit) {
  return Response.json({ jsonrpc: "2.0", id, error: { code, message } }, { status, headers });
}

function jsonRpcResult(id: string | number | null, result: unknown) {
  return Response.json({ jsonrpc: "2.0", id, result });
}

function rpcId(value: unknown): string | number | null {
  if (typeof value === "string" || typeof value === "number") return value;
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rejectionResponse(id: string | number | null, rejection: { code: string; message: string; status: number; retryAfter?: number; detail?: Record<string, unknown> }) {
  const headers = rejection.retryAfter !== undefined
    ? { "retry-after": String(rejection.retryAfter) }
    : undefined;
  const response = Response.json({
    jsonrpc: "2.0",
    id,
    error: {
      code: rejection.code,
      message: rejection.message,
      ...("detail" in rejection && rejection.detail !== undefined ? { data: rejection.detail } : {}),
    },
  }, { status: rejection.status, headers });
  return response;
}

function normalizeAskArguments(args: unknown): NlWebRequest {
  return normalizeAskRequest(args, "mcp");
}

export async function handleMcp(request: Request, env: Env, runtime: AskRuntime = {}): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return new Response("Unsupported Media Type", { status: 415 });
  }

  const remoteIp = request.headers.get("cf-connecting-ip") ?? "unknown";
  const requestId = crypto.randomUUID();
  const preAuth = await runPreAuthChecks(
    env,
    remoteIp,
    requestId,
    "/mcp",
    request.method,
    runtime,
    undefined,
    resolveInstancePolicy(env).language,
  );
  if (!preAuth.ok) {
    return rejectionResponse(null, preAuth.rejection);
  }

  let body: unknown;
  try {
    body = await readJsonBody(request);
  } catch {
    return jsonRpcError(null, -32700, "Parse error");
  }

  if (!isRecord(body)) {
    return jsonRpcError(null, -32600, "Invalid Request");
  }

  const id = rpcId(body.id);
  const method = body.method;

  if (body.jsonrpc !== "2.0" || typeof method !== "string") {
    return jsonRpcError(id, -32600, "Invalid Request");
  }

  if (method === "initialize") {
    return jsonRpcResult(id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "public-ask-worker", version: "1.0.0" },
    });
  }

  if (method === "tools/list") {
    return jsonRpcResult(id, {
      tools: [
        {
          name: "ask",
          description: ASK_TOOL_DESCRIPTION,
          inputSchema: ASK_TOOL_INPUT_SCHEMA,
        },
      ],
    });
  }

  if (method === "tools/call") {
    const params = isRecord(body.params) ? body.params : {};
    const name = params.name;
    if (name !== "ask") {
      return jsonRpcError(id, -32601, "Tool not found");
    }

    let parsed: NlWebRequest;
    try {
      parsed = normalizeAskArguments(params.arguments);
    } catch (error) {
      return jsonRpcError(id, -32602, error instanceof Error ? error.message : "Invalid params");
    }

    const context: AskActionContext = {
      requestId,
      createdAt: new Date().toISOString(),
      method: request.method,
      route: "/mcp",
      remoteIp,
      authorization: request.headers.get("authorization"),
      turnstileToken: null,
      preAuthCompleted: true,
      payloadProvider: async () => parsed,
      signal: request.signal,
    };

    const result = await executeAskAction(context, env, runtime);

    if (!result.ok) {
      return rejectionResponse(id, result);
    }

    const nlwebResponse = {
      _meta: answerMeta(requestId, result.streaming),
      results: result.results,
    };
    return jsonRpcResult(id, {
      content: [{ type: "text", text: JSON.stringify(nlwebResponse) }],
    });
  }

  return jsonRpcError(id, -32601, "Method not found");
}
