import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  Client,
  StreamableHTTPClientTransport,
  PROTOCOL_VERSION_META_KEY,
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
} from "@modelcontextprotocol/client";
import { unstable_dev, type Unstable_DevWorker } from "wrangler";
import {
  ALLOWED_ORIGIN,
  PUBLIC_MCP_ORIGIN,
  badBearer,
  listOnlyBearer,
  trustedBearer,
} from "./fixtures.ts";

const dir = path.dirname(fileURLToPath(import.meta.url));
const workerEntry = path.join(dir, "worker.ts");
const wranglerConfig = path.join(dir, "wrangler.jsonc");

const MODERN_VERSION = "2026-07-28";
const LEGACY_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"] as const;
const PUBLIC_MCP_ORIGIN_HOST = new URL(PUBLIC_MCP_ORIGIN).hostname;

const META = {
  [PROTOCOL_VERSION_META_KEY]: MODERN_VERSION,
  [CLIENT_CAPABILITIES_META_KEY]: {},
  [CLIENT_INFO_META_KEY]: { name: "mcp-protocol-integration", version: "0.0.0" },
};

let worker: Unstable_DevWorker;
let baseUrl: string;

async function searchCalls(): Promise<number> {
  const res = await worker.fetch(`${baseUrl}/health`);
  const body = (await res.json()) as { searchCalls: number };
  return body.searchCalls;
}

function modernHeaders(method: string, name?: string, extra: HeadersInit = {}): HeadersInit {
  return {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    "mcp-protocol-version": MODERN_VERSION,
    "mcp-method": method,
    ...(name ? { "mcp-name": name } : {}),
    host: PUBLIC_MCP_ORIGIN_HOST,
    ...extra,
  };
}

function modernBody(method: string, params: Record<string, unknown>, id: number | string = 1) {
  return {
    jsonrpc: "2.0",
    id,
    method,
    params: { ...params, _meta: META },
  };
}

async function postMcp(
  headers: HeadersInit,
  body: unknown,
  pathSuffix = "/mcp",
): Promise<Response> {
  const response = await worker.fetch(`${baseUrl}${pathSuffix}`, {
    method: "POST",
    headers: headers as Record<string, string>,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  return response as unknown as Response;
}

function parseSseFinalJson(text: string): unknown {
  const matches = [...text.matchAll(/^data:\s*(.+)$/gm)].map((m) => m[1]);
  assert.ok(matches.length > 0, `expected SSE data events, got: ${text.slice(0, 200)}`);
  return JSON.parse(matches.at(-1)!);
}

async function readRpc(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();
  const body = (
    contentType.includes("text/event-stream") ? parseSseFinalJson(text) : JSON.parse(text || "null")
  ) as {
    result?: {
      supportedVersions?: string[];
      protocolVersion?: string;
      tools?: Array<{ name: string }>;
      isError?: boolean;
      content?: Array<{ text: string }>;
      structuredContent?: {
        _meta?: { response_type?: string };
        results?: unknown[];
      };
      _meta?: Record<string, { name?: string; ttlMs?: number; cacheScope?: string }>;
    };
    error?: { code: number; message?: string };
  };
  return { status: response.status, body, headers: response.headers };
}

test.before(async () => {
  worker = await unstable_dev(workerEntry, {
    config: wranglerConfig,
    experimental: { disableExperimentalWarning: true },
  });
  baseUrl = `http://${worker.address}:${worker.port}`;
});

test.after(async () => {
  await worker.stop();
});

test("modern server/discover and tools/list do not invoke ask", async () => {
  await worker.fetch(`${baseUrl}/reset`);
  const before = await searchCalls();
  const discover = await readRpc(
    await postMcp(modernHeaders("server/discover"), modernBody("server/discover", {})),
  );
  assert.equal(discover.status, 200);
  assert.deepEqual(discover.body.result?.supportedVersions, [MODERN_VERSION]);
  assert.equal(
    discover.body.result?._meta?.["io.modelcontextprotocol/serverInfo"]?.name,
    "public-ask-worker",
  );

  const list = await readRpc(await postMcp(modernHeaders("tools/list"), modernBody("tools/list", {})));
  assert.equal(list.status, 200);
  assert.equal(list.body.result?.tools?.[0]?.name, "ask");
  assert.equal(await searchCalls(), before);
});

test("modern tools/call anonymous list invokes retrieval once", async () => {
  await worker.fetch(`${baseUrl}/reset`);
  const before = await searchCalls();
  const res = await readRpc(
    await postMcp(
      modernHeaders("tools/call", "ask"),
      modernBody("tools/call", { name: "ask", arguments: { query: { text: "  hello  " } } }),
    ),
  );
  assert.equal(res.status, 200);
  assert.equal(res.body.result?.isError, undefined);
  assert.equal(res.body.result?.structuredContent?._meta?.response_type, "answer");
  assert.equal(await searchCalls(), before + 1);
});

test("legacy initialize/call/notification for three 2025 versions", async () => {
  for (const version of LEGACY_VERSIONS) {
    await worker.fetch(`${baseUrl}/reset`);
    const before = await searchCalls();
    const init = await readRpc(
      await postMcp(
        {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          host: PUBLIC_MCP_ORIGIN_HOST,
        },
        {
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: version,
            capabilities: {},
            clientInfo: { name: "legacy", version: "1" },
          },
        },
      ),
    );
    assert.equal(init.status, 200);
    assert.equal(init.body.result?.protocolVersion, version);

    const notif = await postMcp(
      {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        host: PUBLIC_MCP_ORIGIN_HOST,
      },
      { jsonrpc: "2.0", method: "notifications/initialized" },
    );
    assert.equal(notif.status, 202);
    assert.equal(await notif.text(), "");

    const call = await readRpc(
      await postMcp(
        {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "mcp-protocol-version": version,
          host: PUBLIC_MCP_ORIGIN_HOST,
        },
        {
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: { name: "ask", arguments: { query: { text: `legacy-${version}` } } },
        },
      ),
    );
    assert.equal(call.status, 200);
    assert.equal(call.body.result?.isError, undefined);
    assert.equal(await searchCalls(), before + 1);
  }
});

test("unsupported modern version and header/body mismatch reject without ask", async () => {
  await worker.fetch(`${baseUrl}/reset`);
  const before = await searchCalls();
  const unsupported = await readRpc(
    await postMcp(
      {
        ...modernHeaders("tools/list"),
        "mcp-protocol-version": "2099-01-01",
      },
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {
          _meta: {
            ...META,
            [PROTOCOL_VERSION_META_KEY]: "2099-01-01",
          },
        },
      },
    ),
  );
  assert.equal(unsupported.status, 400);
  assert.equal(unsupported.body.error?.code, -32022);

  const mismatch = await readRpc(
    await postMcp(modernHeaders("tools/list"), {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {
        _meta: {
          ...META,
          [PROTOCOL_VERSION_META_KEY]: "2025-11-25",
        },
      },
    }),
  );
  assert.equal(mismatch.status, 400);
  assert.equal(mismatch.body.error?.code, -32020);
  assert.equal(await searchCalls(), before);
});

test("security traverse: anonymous list, bad key, unauthorized summarize, pre-auth rate limit", async () => {
  await worker.fetch(`${baseUrl}/reset`);
  const before = await searchCalls();

  const anonList = await readRpc(
    await postMcp(
      modernHeaders("tools/call", "ask"),
      modernBody("tools/call", { name: "ask", arguments: { query: { text: "list-me" } } }),
    ),
  );
  assert.equal(anonList.status, 200);
  assert.equal(anonList.body.result?.isError, undefined);

  const badKey = await readRpc(
    await postMcp(
      modernHeaders("tools/call", "ask", { authorization: badBearer() }),
      modernBody("tools/call", { name: "ask", arguments: { query: { text: "x" } } }),
    ),
  );
  assert.equal(badKey.status, 401);
  assert.equal(badKey.body.result?.isError, true);
  assert.match(badKey.headers.get("www-authenticate") ?? "", /Bearer/);
  assert.match(badKey.body.result?.content?.[0]?.text ?? "", /UNAUTHORIZED/);

  const forbid = await readRpc(
    await postMcp(
      modernHeaders("tools/call", "ask"),
      modernBody("tools/call", {
        name: "ask",
        arguments: { query: { text: "x" }, prefer: { mode: "summarize" } },
      }),
    ),
  );
  assert.equal(forbid.status, 403);
  assert.equal(forbid.body.result?.isError, true);
  assert.match(forbid.body.result?.content?.[0]?.text ?? "", /FORBIDDEN/);

  const rate = await readRpc(
    await postMcp(
      modernHeaders("tools/call", "ask"),
      modernBody("tools/call", { name: "ask", arguments: { query: { text: "x" } } }),
      "/mcp?preauth=rate-limited",
    ),
  );
  assert.equal(rate.status, 429);
  assert.equal(rate.headers.get("retry-after"), "60");
  // pre-auth rejection must not run tools/search
  assert.equal(await searchCalls(), before + 1);
});

test("trusted key summarize succeeds without downgrading failed keys", async () => {
  await worker.fetch(`${baseUrl}/reset`);
  const before = await searchCalls();
  // Empty retrieval → no-reference summarize path (no real model); still exercises Key + mode auth.
  const res = await readRpc(
    await postMcp(
      modernHeaders("tools/call", "ask", { authorization: trustedBearer() }),
      modernBody("tools/call", {
        name: "ask",
        arguments: { query: { text: "trusted" }, prefer: { mode: "summarize" } },
      }),
    ),
  );
  assert.equal(res.status, 200);
  assert.equal(res.body.result?.isError, undefined);
  assert.match(res.body.result?.content?.[0]?.text ?? "", /"@type":"SearchSummary"/);
  assert.equal(await searchCalls(), before + 1);
});

test("CORS allowlist and CLI without Origin are not falsely rejected", async () => {
  const denied = await worker.fetch(`${baseUrl}/mcp`, {
    method: "OPTIONS",
    headers: { origin: "https://evil.example", host: PUBLIC_MCP_ORIGIN_HOST },
  });
  assert.equal(denied.status, 403);

  const preflight = await worker.fetch(`${baseUrl}/mcp`, {
    method: "OPTIONS",
    headers: { origin: ALLOWED_ORIGIN, host: PUBLIC_MCP_ORIGIN_HOST },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), ALLOWED_ORIGIN);
  assert.match(preflight.headers.get("access-control-allow-headers") ?? "", /mcp-protocol-version/);

  const cli = await readRpc(
    await postMcp(
      modernHeaders("tools/list"),
      modernBody("tools/list", {}),
    ),
  );
  assert.equal(cli.status, 200);
});

test("concurrent requests with different keys do not cross outcomes", async () => {
  await worker.fetch(`${baseUrl}/reset`);
  const [forbiddenMode, unauthorized] = await Promise.all([
    readRpc(
      await postMcp(
        modernHeaders("tools/call", "ask", { authorization: listOnlyBearer() }),
        modernBody("tools/call", {
          name: "ask",
          arguments: { query: { text: "a" }, prefer: { mode: "summarize" } },
        }, 11),
      ),
    ),
    readRpc(
      await postMcp(
        modernHeaders("tools/call", "ask", { authorization: badBearer() }),
        modernBody("tools/call", {
          name: "ask",
          arguments: { query: { text: "b" }, prefer: { mode: "list" } },
        }, 12),
      ),
    ),
  ]);
  assert.equal(forbiddenMode.status, 403);
  assert.match(forbiddenMode.body.result?.content?.[0]?.text ?? "", /FORBIDDEN/);
  assert.equal(unauthorized.status, 401);
  assert.match(unauthorized.body.result?.content?.[0]?.text ?? "", /UNAUTHORIZED/);
});

test("SDK client modern pin and legacy default both reach one ask tool", async () => {
  await worker.fetch(`${baseUrl}/reset`);
  const before = await searchCalls();
  const fetchImpl = ((url: RequestInfo | URL, init?: RequestInit) => {
    const target = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
    return worker.fetch(target.replace(/^https?:\/\/[^/]+/, baseUrl), init as never);
  }) as unknown as typeof fetch;

  const modern = new Client(
    { name: "modern-client", version: "1.0.0" },
    { versionNegotiation: { mode: { pin: MODERN_VERSION } } },
  );
  await modern.connect(new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), { fetch: fetchImpl }));
  assert.equal(modern.getProtocolEra(), "modern");
  const modernResult = await modern.callTool({ name: "ask", arguments: { query: { text: "via-modern-client" } } });
  assert.equal(
    (modernResult as { structuredContent?: { _meta?: { response_type?: string } } }).structuredContent?._meta
      ?.response_type,
    "answer",
  );
  await modern.close();

  const legacy = new Client({ name: "legacy-client", version: "1.0.0" });
  await legacy.connect(new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), { fetch: fetchImpl }));
  assert.equal(legacy.getProtocolEra(), "legacy");
  const legacyResult = await legacy.callTool({ name: "ask", arguments: { query: { text: "via-legacy-client" } } });
  const legacyText = (legacyResult as { content: Array<{ text: string }> }).content[0].text;
  assert.match(legacyText, /"response_type":"answer"/);
  await legacy.close();

  assert.equal(await searchCalls(), before + 2);
});
