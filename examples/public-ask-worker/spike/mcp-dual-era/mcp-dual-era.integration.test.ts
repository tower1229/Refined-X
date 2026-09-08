import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
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
  MAX_REQUEST_BODY_BYTES,
  PUBLIC_MCP_ORIGIN_HOST,
} from "./http-boundary.ts";

const spikeDir = path.dirname(fileURLToPath(import.meta.url));
const workerEntry = path.join(spikeDir, "worker.ts");
const wranglerConfig = path.join(spikeDir, "wrangler.jsonc");

const MODERN_VERSION = "2026-07-28";
const LEGACY_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"] as const;

const META = {
  [PROTOCOL_VERSION_META_KEY]: MODERN_VERSION,
  [CLIENT_CAPABILITIES_META_KEY]: {},
  [CLIENT_INFO_META_KEY]: { name: "spike-test", version: "0.0.0" },
};

let worker: Unstable_DevWorker;
let baseUrl: string;

async function askCalls(): Promise<number> {
  const res = await worker.fetch(`${baseUrl}/health`);
  const body = (await res.json()) as { askCalls: number };
  return body.askCalls;
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
  init: { signal?: AbortSignal } = {},
): Promise<Response> {
  return worker.fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
    signal: init.signal,
  });
}

function parseSseFinalJson(text: string): unknown {
  const matches = [...text.matchAll(/^data:\s*(.+)$/gm)].map((m) => m[1]);
  assert.ok(matches.length > 0, `expected SSE data events, got: ${text.slice(0, 200)}`);
  return JSON.parse(matches.at(-1)!);
}

async function readRpc(response: Response): Promise<{
  status: number;
  body: {
    result?: {
      supportedVersions?: string[];
      protocolVersion?: string;
      tools?: Array<{ name: string }>;
      isError?: boolean;
      content?: Array<{ text: string }>;
      structuredContent?: { text?: string; mode?: string; ok?: boolean };
      _meta?: Record<string, { name?: string }>;
    };
    error?: { code: number; message?: string };
  };
  headers: Headers;
}> {
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
      structuredContent?: { text?: string; mode?: string; ok?: boolean };
      _meta?: Record<string, { name?: string }>;
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

test("pinned SDK lockfile integrity is present for @modelcontextprotocol/server@2.0.0", () => {
  const lockPath = path.join(spikeDir, "../../package-lock.json");
  const pkgPath = path.join(spikeDir, "../../package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
    dependencies: Record<string, string>;
  };
  assert.equal(pkg.dependencies["@modelcontextprotocol/server"], "2.0.0");
  const lock = JSON.parse(readFileSync(lockPath, "utf8")) as {
    packages: Record<string, { version?: string; integrity?: string }>;
  };
  const entry = lock.packages["node_modules/@modelcontextprotocol/server"];
  assert.equal(entry?.version, "2.0.0");
  assert.match(entry?.integrity ?? "", /^sha512-/);

  const rootPkg = JSON.parse(readFileSync(path.join(spikeDir, "../../../../package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  assert.equal(rootPkg.dependencies?.["@modelcontextprotocol/server"], undefined);
  assert.equal(rootPkg.devDependencies?.["@modelcontextprotocol/server"], undefined);
});

test("modern server/discover and tools/list do not invoke ask", async () => {
  const before = await askCalls();
  const discover = await readRpc(
    await postMcp(modernHeaders("server/discover"), modernBody("server/discover", {})),
  );
  assert.equal(discover.status, 200);
  assert.deepEqual(discover.body.result.supportedVersions, [MODERN_VERSION]);
  assert.equal(discover.body.result._meta?.["io.modelcontextprotocol/serverInfo"]?.name, "public-ask-mcp-sdk-spike");

  const list = await readRpc(await postMcp(modernHeaders("tools/list"), modernBody("tools/list", {})));
  assert.equal(list.status, 200);
  assert.equal(list.body.result.tools[0].name, "ask");
  assert.equal(await askCalls(), before);
});

test("modern tools/call invokes ask exactly once and applies MCP mode default", async () => {
  const before = await askCalls();
  const res = await readRpc(
    await postMcp(
      modernHeaders("tools/call", "ask"),
      modernBody("tools/call", { name: "ask", arguments: { query: { text: "  hello  " } } }),
    ),
  );
  assert.equal(res.status, 200);
  assert.equal(res.body.result.structuredContent.text, "hello");
  assert.equal(res.body.result.structuredContent.mode, "list");
  assert.equal(await askCalls(), before + 1);
});

test("CfWorker schema validator rejects non-object query under workerd HTTP", async () => {
  const before = await askCalls();
  const res = await readRpc(
    await postMcp(
      modernHeaders("tools/call", "ask"),
      modernBody("tools/call", { name: "ask", arguments: { query: "not-an-object" } }),
    ),
  );
  assert.equal(res.status, 200);
  assert.equal(res.body.result.isError, true);
  assert.equal(await askCalls(), before, "schema failure must not enter ask callback");
});

test("CfWorkerJsonSchemaValidator rejects invalid structuredContent under workerd HTTP", async () => {
  const before = await askCalls();
  const res = await readRpc(
    await postMcp(
      modernHeaders("tools/call", "ask"),
      modernBody("tools/call", {
        name: "ask",
        arguments: { query: { text: "bad-out" }, auth: "bad-output" },
      }),
    ),
  );
  assert.equal(res.status, 200);
  assert.equal(res.body.result?.isError, true);
  assert.equal(await askCalls(), before + 1);
});

test("Unicode length and empty mode boundaries without model calls", async () => {
  const emoji500 = "😀".repeat(500);
  const emoji501 = "😀".repeat(501);
  const before = await askCalls();

  const ok = await readRpc(
    await postMcp(
      modernHeaders("tools/call", "ask"),
      modernBody("tools/call", { name: "ask", arguments: { query: { text: ` ${emoji500} ` } } }),
    ),
  );
  assert.equal(ok.status, 200);
  assert.equal(ok.body.result?.structuredContent?.ok, true);

  const empty = await readRpc(
    await postMcp(
      modernHeaders("tools/call", "ask"),
      modernBody("tools/call", { name: "ask", arguments: { query: { text: "   " } } }),
    ),
  );
  assert.equal(empty.body.result?.isError, true);
  assert.match(empty.body.result?.content?.[0]?.text ?? "", /INVALID_QUERY/);

  const tooLong = await readRpc(
    await postMcp(
      modernHeaders("tools/call", "ask"),
      modernBody("tools/call", { name: "ask", arguments: { query: { text: emoji501 } } }),
    ),
  );
  assert.equal(tooLong.status, 200);
  assert.equal(tooLong.body.result?.isError, true);
  assert.match(tooLong.body.result?.content?.[0]?.text ?? "", /INVALID_QUERY/);

  const emptyMode = await readRpc(
    await postMcp(
      modernHeaders("tools/call", "ask"),
      modernBody("tools/call", {
        name: "ask",
        arguments: { query: { text: "中文问题" }, prefer: { mode: "" } },
      }),
    ),
  );
  assert.equal(emptyMode.body.result?.structuredContent?.mode, "list");

  const blankMode = await readRpc(
    await postMcp(
      modernHeaders("tools/call", "ask"),
      modernBody("tools/call", {
        name: "ask",
        arguments: { query: { text: "blank-mode" }, prefer: { mode: " , " } },
      }),
    ),
  );
  assert.equal(blankMode.body.result?.structuredContent?.mode, "list");

  const unknownMode = await readRpc(
    await postMcp(
      modernHeaders("tools/call", "ask"),
      modernBody("tools/call", {
        name: "ask",
        arguments: { query: { text: "bad-mode" }, prefer: { mode: "await" } },
      }),
    ),
  );
  assert.equal(unknownMode.body.result?.isError, true);
  assert.match(unknownMode.body.result?.content?.[0]?.text ?? "", /UNSUPPORTED_MODE/);

  const extraField = await readRpc(
    await postMcp(
      modernHeaders("tools/call", "ask"),
      modernBody("tools/call", {
        name: "ask",
        arguments: { query: { text: "x" }, memory: { keep: true } },
      }),
    ),
  );
  assert.equal(extraField.body.result?.isError, true);
  assert.equal(await askCalls(), before + 6);
});

test("legacy subsequent POST with unsupported protocol version header rejects without ask", async () => {
  const before = await askCalls();
  const res = await readRpc(
    await postMcp(
      {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": "2099-01-01",
        host: PUBLIC_MCP_ORIGIN_HOST,
      },
      {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "ask", arguments: { query: { text: "nope" } } },
      },
    ),
  );
  assert.notEqual(res.status, 200);
  assert.equal(await askCalls(), before);
});

test("cancel/timeout aborts in-flight ask without hanging", async () => {
  const before = await askCalls();
  const controller = new AbortController();
  const pending = postMcp(
    modernHeaders("tools/call", "ask"),
    modernBody("tools/call", {
      name: "ask",
      arguments: { query: { text: "slow" }, delayMs: 5_000 },
    }),
    { signal: controller.signal },
  );
  setTimeout(() => controller.abort(), 50);
  await assert.rejects(async () => {
    await pending;
  });
  await new Promise((r) => setTimeout(r, 150));
  const after = await askCalls();
  // Client abort may land before or after tool entry; must not hang or double-call.
  assert.ok(after === before || after === before + 1);
});

test("legacy initialize/call/notification for three 2025 versions", async () => {
  for (const version of LEGACY_VERSIONS) {
    const before = await askCalls();
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
    assert.equal(init.body.result.protocolVersion, version);
    assert.equal(await askCalls(), before);

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
    assert.equal(await askCalls(), before);

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
    assert.equal(call.body.result.structuredContent?.text ?? JSON.parse(call.body.result.content[0].text).text, `legacy-${version}`);
    assert.equal(await askCalls(), before + 1);
  }
});

test("unsupported modern version and header/body mismatch reject without ask", async () => {
  const before = await askCalls();
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
  assert.equal(unsupported.body.error.code, -32022);

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
  assert.equal(mismatch.body.error.code, -32020);
  assert.equal(await askCalls(), before);
});

test("unsupported legacy initialize counter-offers supported legacy version", async () => {
  const before = await askCalls();
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
          protocolVersion: "2099-01-01",
          capabilities: {},
          clientInfo: { name: "legacy", version: "1" },
        },
      },
    ),
  );
  assert.equal(init.status, 200);
  assert.equal(init.body.result.protocolVersion, "2025-11-25");
  assert.equal(await askCalls(), before);
});

test("auth/quota HTTP status mapping and concurrent isolation", async () => {
  const before = await askCalls();
  const [unauthorized, forbidden, quota] = await Promise.all([
    readRpc(
      await postMcp(
        modernHeaders("tools/call", "ask"),
        modernBody("tools/call", {
          name: "ask",
          arguments: { query: { text: "a" }, auth: "unauthorized" },
        }),
      ),
    ),
    readRpc(
      await postMcp(
        modernHeaders("tools/call", "ask"),
        modernBody("tools/call", {
          name: "ask",
          arguments: { query: { text: "b" }, auth: "forbidden" },
        }),
      ),
    ),
    readRpc(
      await postMcp(
        modernHeaders("tools/call", "ask"),
        modernBody("tools/call", {
          name: "ask",
          arguments: { query: { text: "c" }, auth: "quota" },
        }),
      ),
    ),
  ]);
  assert.equal(unauthorized.status, 401);
  assert.match(unauthorized.body.result.content[0].text, /UNAUTHORIZED/);
  assert.equal(forbidden.status, 403);
  assert.match(forbidden.body.result.content[0].text, /FORBIDDEN/);
  assert.equal(quota.status, 429);
  assert.equal(quota.headers.get("retry-after"), "30");
  assert.match(quota.body.result.content[0].text, /RATE_LIMITED/);
  assert.equal(await askCalls(), before + 3);
});

test("legacy SSE final-state read preserves remapped auth status", async () => {
  const before = await askCalls();
  const res = await postMcp(
    {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-11-25",
      host: PUBLIC_MCP_ORIGIN_HOST,
    },
    {
      jsonrpc: "2.0",
      id: 9,
      method: "tools/call",
      params: { name: "ask", arguments: { query: { text: "sse" }, auth: "unauthorized" } },
    },
  );
  assert.equal(res.status, 401);
  assert.match(res.headers.get("content-type") ?? "", /text\/event-stream|application\/json/);
  const body = await readRpc(new Response(await res.arrayBuffer(), { status: res.status, headers: res.headers }));
  assert.equal(body.body.result.isError, true);
  assert.equal(await askCalls(), before + 1);
});

test("CORS allowlist and 16 KiB request bound", async () => {
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

  const before = await askCalls();
  const oversize = "x".repeat(MAX_REQUEST_BODY_BYTES + 64);
  const res = await postMcp(
    modernHeaders("tools/call", "ask", { origin: ALLOWED_ORIGIN }),
    modernBody("tools/call", { name: "ask", arguments: { query: { text: oversize } } }),
  );
  assert.equal(res.status, 413);
  assert.equal(await askCalls(), before);
});

test("bounded SDK response returns 500 without partial body when over budget", async () => {
  const before = await askCalls();
  const res = await postMcp(
    modernHeaders("tools/call", "ask"),
    modernBody("tools/call", {
      name: "ask",
      arguments: { query: { text: "pad" }, padBytes: 200_000 },
    }),
  );
  assert.equal(res.status, 500);
  const text = await res.text();
  assert.match(text, /RESPONSE_TOO_LARGE/);
  assert.ok(text.length < 4096);
  assert.equal(await askCalls(), before + 1);
});

test("SDK client modern pin and legacy default both reach one ask tool", async () => {
  const before = await askCalls();
  const fetchImpl = (url: RequestInfo | URL, init?: RequestInit) => {
    const target = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
    return worker.fetch(target.replace(/^https?:\/\/[^/]+/, baseUrl), init);
  };

  const modern = new Client(
    { name: "modern-client", version: "1.0.0" },
    { versionNegotiation: { mode: { pin: MODERN_VERSION } } },
  );
  await modern.connect(new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), { fetch: fetchImpl }));
  assert.equal(modern.getProtocolEra(), "modern");
  const modernResult = await modern.callTool({ name: "ask", arguments: { query: { text: "via-modern-client" } } });
  assert.equal((modernResult as { structuredContent?: { text?: string } }).structuredContent?.text, "via-modern-client");
  await modern.close();

  const legacy = new Client({ name: "legacy-client", version: "1.0.0" });
  await legacy.connect(new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), { fetch: fetchImpl }));
  assert.equal(legacy.getProtocolEra(), "legacy");
  const legacyResult = await legacy.callTool({ name: "ask", arguments: { query: { text: "via-legacy-client" } } });
  const legacyText =
    (legacyResult as { structuredContent?: { text?: string } }).structuredContent?.text ??
    JSON.parse((legacyResult as { content: Array<{ text: string }> }).content[0].text).text;
  assert.equal(legacyText, "via-legacy-client");
  await legacy.close();

  assert.equal(await askCalls(), before + 2);
});

test("wrangler dry-run bundle of spike worker succeeds", () => {
  const result = spawnSync(
    "npx",
    ["wrangler", "deploy", "--dry-run", "--outdir", path.join(spikeDir, ".dry-run"), "--config", wranglerConfig],
    { cwd: path.join(spikeDir, "../.."), encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
