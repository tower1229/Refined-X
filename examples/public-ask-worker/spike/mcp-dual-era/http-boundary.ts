import { createMcpHandler } from "@modelcontextprotocol/server";
import type { AskCallback, AskHttpOutcome } from "./ask-tool.ts";
import { createSpikeAskServer, spikeStore } from "./factory.ts";

export const MAX_REQUEST_BODY_BYTES = 16 * 1024;
export const MAX_RESPONSE_BODY_BYTES = 128 * 1024;

export const ALLOWED_ORIGIN = "https://spike.example";
export const PUBLIC_MCP_ORIGIN_HOST = "ask.spike.local";

const CORS_ALLOW_HEADERS = [
  "content-type",
  "authorization",
  "accept",
  "mcp-protocol-version",
  "mcp-method",
  "mcp-name",
].join(", ");

export type SpikeHttpEnv = {
  ask: AskCallback;
};

/**
 * Published @modelcontextprotocol/server@2.0.0 documents no maxRequestBodySize
 * option in its installed CreateMcpHandlerOptions. Bound the body here and pass
 * parsedBody into the SDK handler (plan §6.3 / S19).
 */
export function createSpikeMcpFetch(env: SpikeHttpEnv): (request: Request) => Promise<Response> {
  const handler = createMcpHandler(createSpikeAskServer, {
    legacy: "stateless",
    responseMode: "json",
  });

  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get("origin");
    if (request.method === "OPTIONS") {
      if (origin && origin !== ALLOWED_ORIGIN) {
        return new Response("Forbidden", { status: 403 });
      }
      return withCors(
        new Response(null, {
          status: 204,
          headers: {
            "access-control-allow-methods": "POST, OPTIONS",
            "access-control-max-age": "86400",
          },
        }),
        origin,
      );
    }

    if (request.method !== "POST") {
      return withCors(new Response("Method not allowed", { status: 405 }), origin);
    }

    const host = request.headers.get("host")?.split(":")[0] ?? "";
    if (host && host !== PUBLIC_MCP_ORIGIN_HOST && host !== "127.0.0.1" && host !== "localhost") {
      return withCors(new Response("Forbidden host", { status: 403 }), origin);
    }
    if (origin && origin !== ALLOWED_ORIGIN) {
      return withCors(new Response("Forbidden origin", { status: 403 }), origin);
    }

    const raw = new Uint8Array(await request.arrayBuffer());
    if (raw.byteLength > MAX_REQUEST_BODY_BYTES) {
      return withCors(new Response("Payload Too Large", { status: 413 }), origin);
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

    const outcome: AskHttpOutcome = { status: 200 };
    const sdkResponse = await spikeStore.run({ ask: env.ask, outcome }, () =>
      handler.fetch(rebuilt, parsedBody === undefined ? undefined : { parsedBody }),
    );

    const buffered = await bufferResponse(sdkResponse);
    if (buffered.byteLength > MAX_RESPONSE_BODY_BYTES) {
      return withCors(
        new Response(JSON.stringify({ error: { code: "RESPONSE_TOO_LARGE", message: "bounded" } }), {
          status: 500,
          headers: { "content-type": "application/json" },
        }),
        origin,
      );
    }

    const headers = new Headers(buffered.headers);
    if (outcome.retryAfter !== undefined) {
      headers.set("retry-after", String(outcome.retryAfter));
    }
    const status = outcome.status !== 200 ? outcome.status : buffered.status;
    return withCors(new Response(buffered.body, { status, headers }), origin);
  };
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

function withCors(response: Response, origin: string | null): Response {
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-headers", CORS_ALLOW_HEADERS);
  headers.set("access-control-expose-headers", "retry-after");
  if (origin === ALLOWED_ORIGIN) {
    headers.set("access-control-allow-origin", origin);
  }
  return new Response(response.body, { status: response.status, headers });
}
