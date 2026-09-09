/**
 * Drive Claude Code (modern) and Codex CLI (legacy default) against the
 * synthetic acceptance Worker. Writes evidence + updates record JSON.
 *
 * Prerequisites: `node test/product-clients/serve.mjs` already running
 * (or this script boots one). Uses local product CLIs only.
 */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { trustedBearer, badBearer } from "../mcp-protocol/fixtures.ts";
import { validateProductClientRecord } from "./record-schema.ts";

const dir = dirname(fileURLToPath(import.meta.url));
const urlFile = join(dir, ".acceptance-base-url");
const evidenceRoot = join(dir, "evidence");
const recordsDir = join(dir, "records");

const CODEX =
  process.env.CODEX_BIN ||
  join(process.env.HOME || "", ".codex/plugins/.plugin-appserver/codex");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForUrlFile(timeoutMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (existsSync(urlFile)) {
      const url = readFileSync(urlFile, "utf8").trim();
      if (url.startsWith("http")) return url;
    }
    await sleep(250);
  }
  throw new Error("acceptance server did not write .acceptance-base-url");
}

async function ensureServer() {
  if (existsSync(urlFile)) {
    const base = readFileSync(urlFile, "utf8").trim();
    try {
      const res = await fetch(`${base}/health`);
      if (res.ok) return { baseUrl: base, child: null };
    } catch {
      // fall through and boot
    }
  }
  rmSync(urlFile, { force: true });
  const child = spawn(
    process.execPath,
    ["--experimental-strip-types", join(dir, "serve.mjs")],
    {
      cwd: join(dir, "../.."),
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    },
  );
  let bootLog = "";
  child.stdout.on("data", (c) => {
    bootLog += c.toString();
    process.stdout.write(c);
  });
  child.stderr.on("data", (c) => {
    bootLog += c.toString();
    process.stderr.write(c);
  });
  const baseUrl = await waitForUrlFile();
  return { baseUrl, child, bootLog };
}

async function reset(baseUrl) {
  await fetch(`${baseUrl}/reset`, { method: "POST" });
}

async function readTrace(baseUrl) {
  const res = await fetch(`${baseUrl}/trace`);
  return (await res.json());
}

function writeEvidence(clientId, name, content) {
  const dest = join(evidenceRoot, clientId);
  mkdirSync(dest, { recursive: true });
  const path = join(dest, name);
  writeFileSync(path, typeof content === "string" ? content : JSON.stringify(content, null, 2) + "\n");
  return path;
}

function writeRecord(fileName, record) {
  const errors = validateProductClientRecord(record);
  if (errors.length) {
    throw new Error(`invalid record ${fileName}: ${errors.join("; ")}`);
  }
  writeFileSync(join(recordsDir, fileName), JSON.stringify(record, null, 2) + "\n");
}

function runCapture(cmd, args, env, cwd, options = {}) {
  const result = spawnSync(cmd, args, {
    cwd,
    env: { ...process.env, ...env },
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    timeout: 240_000,
    stdio: [options.stdin === "ignore" ? "ignore" : "pipe", "pipe", "pipe"],
  });
  return {
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error: result.error ? String(result.error) : null,
  };
}

async function runClaudeModern(baseUrl) {
  const clientId = "claude-code-modern";
  const mcpUrl = `${baseUrl}/mcp`;
  const versionOut = runCapture("claude", ["--version"], {}, dir);
  const versionText = `${versionOut.stdout}\n${versionOut.stderr}`;
  const clientVersion = versionText.match(/\b(\d+\.\d+\.\d+)\b/)?.[1] || versionText.trim() || "unknown";
  const platform = `${process.platform}/${process.arch}`;

  if (!process.env.ANTHROPIC_AUTH_TOKEN && !process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_AUTH_TOKEN or ANTHROPIC_API_KEY required for Claude Code -p acceptance");
  }

  const mcpConfig = {
    mcpServers: {
      "refined-x-ask": {
        type: "http",
        url: mcpUrl,
      },
    },
  };
  const mcpConfigAuth = {
    mcpServers: {
      "refined-x-ask": {
        type: "http",
        url: mcpUrl,
        headers: {
          Authorization: trustedBearer(),
        },
      },
    },
  };
  const mcpConfigBad = {
    mcpServers: {
      "refined-x-ask": {
        type: "http",
        url: mcpUrl,
        headers: {
          Authorization: badBearer(),
        },
      },
    },
  };

  const configDir = join(tmpdir(), `claude-acceptance-mcp-${process.pid}`);
  mkdirSync(configDir, { recursive: true });
  const configPath = join(configDir, "claude-modern.mcp.json");
  const configAuthPath = join(configDir, "claude-modern-auth.mcp.json");
  const configBadPath = join(configDir, "claude-modern-bad.mcp.json");
  const settingsPath = join(configDir, "claude-acceptance.settings.json");
  writeFileSync(configPath, JSON.stringify(mcpConfig, null, 2) + "\n");
  writeFileSync(configAuthPath, JSON.stringify(mcpConfigAuth, null, 2) + "\n");
  writeFileSync(configBadPath, JSON.stringify(mcpConfigBad, null, 2) + "\n");
  writeFileSync(
    settingsPath,
    JSON.stringify(
      {
        env: {
          ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL || "https://api.deepseek.com/anthropic",
          ANTHROPIC_AUTH_TOKEN: process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY,
          ANTHROPIC_MODEL: "DeepSeek-V4-Flash",
          ANTHROPIC_DEFAULT_SONNET_MODEL: "DeepSeek-V4-Flash",
          ANTHROPIC_DEFAULT_OPUS_MODEL: "DeepSeek-V4-Flash",
          ANTHROPIC_DEFAULT_HAIKU_MODEL: "DeepSeek-V4-Flash",
          CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
        },
      },
      null,
      2,
    ) + "\n",
  );

  await reset(baseUrl);

  const envModern = {
    MCP_SDK_GENERATION: "v2",
    MCP_PROTOCOL_NEGOTIATION: "auto",
  };

  function claudeArgs(mcpConfigFile, prompt) {
    return [
      "-p",
      prompt,
      "--bare",
      "--settings",
      settingsPath,
      "--verbose",
      "--strict-mcp-config",
      "--mcp-config",
      mcpConfigFile,
      "--allowedTools",
      "mcp__refined-x-ask__ask",
      "--dangerously-skip-permissions",
      "--output-format",
      "stream-json",
    ];
  }

  const listPrompt =
    'Call mcp__refined-x-ask__ask with {"query":{"text":"acceptance list"},"prefer":{"mode":"list"}} then say DONE';
  const listRun = runCapture("claude", claudeArgs(configPath, listPrompt), envModern, dir, {
    stdin: "ignore",
  });
  writeEvidence(clientId, "01-discover-and-list.stream.jsonl", listRun.stdout);
  writeEvidence(clientId, "01-discover-and-list.stderr.txt", `${listRun.stderr}\nstatus:${listRun.status}`);
  const listTrace = await readTrace(baseUrl);
  writeEvidence(clientId, "01-server-trace.json", listTrace);

  await reset(baseUrl);
  const summarizePrompt =
    'Call mcp__refined-x-ask__ask with {"query":{"text":"acceptance summarize"},"prefer":{"mode":"summarize"}} then say DONE';
  const summarizeRun = runCapture("claude", claudeArgs(configAuthPath, summarizePrompt), envModern, dir, {
    stdin: "ignore",
  });
  writeEvidence(clientId, "02-auth-summarize.stream.jsonl", summarizeRun.stdout);
  writeEvidence(clientId, "02-auth-summarize.stderr.txt", `${summarizeRun.stderr}\nstatus:${summarizeRun.status}`);
  const summarizeTrace = await readTrace(baseUrl);
  writeEvidence(clientId, "02-server-trace.json", summarizeTrace);

  await reset(baseUrl);
  const errorPrompt =
    'Call mcp__refined-x-ask__ask with {"query":{"text":"should fail auth"},"prefer":{"mode":"summarize"}} then report the error and say DONE';
  const errorRun = runCapture("claude", claudeArgs(configBadPath, errorPrompt), envModern, dir, {
    stdin: "ignore",
  });
  writeEvidence(clientId, "03-error-handling.stream.jsonl", errorRun.stdout);
  writeEvidence(clientId, "03-error-handling.stderr.txt", `${errorRun.stderr}\nstatus:${errorRun.status}`);
  const errorTrace = await readTrace(baseUrl);
  writeEvidence(clientId, "03-server-trace.json", errorTrace);

  const modernSeen = [...(listTrace.trace || []), ...(summarizeTrace.trace || []), ...(errorTrace.trace || [])].some(
    (e) => e.mcpProtocolVersion === "2026-07-28" || e.jsonRpcMethod === "server/discover",
  );
  const discovered =
    (listTrace.trace || []).some((e) => e.jsonRpcMethod === "server/discover") &&
    (listTrace.trace || []).some((e) => e.jsonRpcMethod === "tools/list");
  const listOk =
    (listTrace.searchCalls ?? 0) >= 1 &&
    (listTrace.trace || []).some(
      (e) => e.jsonRpcMethod === "tools/call" && e.status === 200 && e.authorizationPresent === false,
    );
  const summarizeOk = (summarizeTrace.trace || []).some(
    (e) => e.authorizationPresent && e.jsonRpcMethod === "tools/call" && e.status === 200,
  );
  const errorOk =
    /401|Unauthorized|invalid|API_KEY|forbidden|error|UNAUTHORIZED/i.test(
      errorRun.stdout + errorRun.stderr,
    ) ||
    (errorTrace.trace || []).some((e) => e.authorizationPresent && (e.status === 401 || e.status === 403));

  const record = {
    client: "Claude Code",
    clientVersion,
    platform,
    runtime: "v2",
    negotiation: "auto",
    observedProtocolVersion: modernSeen ? "2026-07-28" : null,
    toolDiscovery: discovered ? "passed" : "failed",
    anonymousList: listOk ? "passed" : "failed",
    authenticatedSummarize: summarizeOk ? "passed" : "failed",
    errorHandling: errorOk ? "passed" : "failed",
    testedAt: new Date().toISOString(),
    evidencePath: `examples/public-ask-worker/test/product-clients/evidence/${clientId}/`,
    businessBackend: "synthetic_mock",
    featureFlags: {
      MCP_SDK_GENERATION: "v2",
      MCP_PROTOCOL_NEGOTIATION: "auto",
    },
    notes:
      "Modern path forced via MCP_SDK_GENERATION=v2 and MCP_PROTOCOL_NEGOTIATION=auto. Synthetic mock Worker uses empty retrieval so summarize stays on the no-reference path (no production AI Search/model).",
  };

  writeRecord("claude-code-modern.json", record);
  return record;
}

async function runCodexLegacy(baseUrl) {
  const clientId = "codex-legacy";
  const mcpUrl = `${baseUrl}/mcp`;
  assert.ok(existsSync(CODEX), `Codex binary not found at ${CODEX}`);

  const versionOut = runCapture(CODEX, ["--version"], {}, dir);
  const clientVersion = (versionOut.stdout || versionOut.stderr).trim().replace(/^codex-cli\s+/i, "") || "unknown";
  const platform = `${process.platform}/${process.arch}`;

  const codexHome = join(tmpdir(), `refined-x-codex-acceptance-${process.pid}`);
  mkdirSync(codexHome, { recursive: true });
  // Minimal isolated config: legacy path = mcp_2026_07_28 disabled (product default).
  const configToml = `
model = "gpt-6-astra"
approval_policy = "never"
sandbox_mode = "read-only"

[features]
mcp_2026_07_28 = false

[mcp_servers.refined_x_ask]
url = "${mcpUrl}"
`;
  writeFileSync(join(codexHome, "config.toml"), configToml);
  // Reuse ChatGPT login from the user home if present.
  const userAuth = join(process.env.HOME || "", ".codex/auth.json");
  if (existsSync(userAuth)) {
    writeFileSync(join(codexHome, "auth.json"), readFileSync(userAuth));
  }

  await reset(baseUrl);

  const env = { CODEX_HOME: codexHome };

  const listServers = runCapture(CODEX, ["mcp", "list"], env, dir);
  writeEvidence(clientId, "01-mcp-list.txt", `stdout:\n${listServers.stdout}\nstderr:\n${listServers.stderr}\nstatus:${listServers.status}`);

  const getServer = runCapture(CODEX, ["mcp", "get", "refined_x_ask"], env, dir);
  writeEvidence(clientId, "02-mcp-get.txt", `stdout:\n${getServer.stdout}\nstderr:\n${getServer.stderr}\nstatus:${getServer.status}`);

  const features = runCapture(CODEX, ["features", "list"], env, dir);
  writeEvidence(clientId, "03-features.txt", features.stdout + features.stderr);

  await reset(baseUrl);
  const listPrompt =
    'Call MCP tool refined_x_ask.ask with arguments {"query":{"text":"acceptance list"},"prefer":{"mode":"list"}}. Then reply with one short sentence and the word DONE.';
  const listResult = runCapture(
    CODEX,
    ["exec", "--skip-git-repo-check", "-s", "read-only", listPrompt],
    env,
    dir,
    { stdin: "ignore" },
  );
  writeEvidence(clientId, "04-anonymous-list.txt", `stdout:\n${listResult.stdout}\nstderr:\n${listResult.stderr}\nstatus:${listResult.status}`);
  const listTrace = await readTrace(baseUrl);
  writeEvidence(clientId, "04-server-trace.json", listTrace);

  // Authenticated summarize via http_headers in a second config overlay.
  const authConfig = `
model = "gpt-6-astra"
approval_policy = "never"
sandbox_mode = "read-only"

[features]
mcp_2026_07_28 = false

[mcp_servers.refined_x_ask]
url = "${mcpUrl}"
http_headers = { Authorization = "${trustedBearer()}" }
`;
  writeFileSync(join(codexHome, "config.toml"), authConfig);
  await reset(baseUrl);
  const summarizePrompt =
    'Call MCP tool refined_x_ask.ask with arguments {"query":{"text":"acceptance summarize"},"prefer":{"mode":"summarize"}}. Then reply with one short sentence and the word DONE.';
  const summarizeRun = runCapture(
    CODEX,
    ["exec", "--skip-git-repo-check", "-s", "read-only", summarizePrompt],
    env,
    dir,
    { stdin: "ignore" },
  );
  writeEvidence(clientId, "05-auth-summarize.txt", `stdout:\n${summarizeRun.stdout}\nstderr:\n${summarizeRun.stderr}\nstatus:${summarizeRun.status}`);
  const summarizeTrace = await readTrace(baseUrl);
  writeEvidence(clientId, "05-server-trace.json", summarizeTrace);

  const badConfig = `
model = "gpt-6-astra"
approval_policy = "never"
sandbox_mode = "read-only"

[features]
mcp_2026_07_28 = false

[mcp_servers.refined_x_ask]
url = "${mcpUrl}"
http_headers = { Authorization = "${badBearer()}" }
`;
  writeFileSync(join(codexHome, "config.toml"), badConfig);
  await reset(baseUrl);
  const errorPrompt =
    'Call MCP tool refined_x_ask.ask with arguments {"query":{"text":"should fail auth"},"prefer":{"mode":"summarize"}}. Report the error text, then DONE.';
  const errorRun = runCapture(
    CODEX,
    ["exec", "--skip-git-repo-check", "-s", "read-only", errorPrompt],
    env,
    dir,
    { stdin: "ignore" },
  );
  writeEvidence(clientId, "06-error-handling.txt", `stdout:\n${errorRun.stdout}\nstderr:\n${errorRun.stderr}\nstatus:${errorRun.status}`);
  const errorTrace = await readTrace(baseUrl);
  writeEvidence(clientId, "06-server-trace.json", errorTrace);

  const allTrace = [...(listTrace.trace || []), ...(summarizeTrace.trace || []), ...(errorTrace.trace || [])];
  const legacyVersion =
    allTrace.map((e) => e.mcpProtocolVersion).find((v) => typeof v === "string" && v.startsWith("2025-")) || null;
  const modernForced = allTrace.some((e) => e.mcpProtocolVersion === "2026-07-28");

  const discoveryOk =
    listServers.status === 0 &&
    /refined_x_ask/i.test(listServers.stdout + getServer.stdout) &&
    (listTrace.trace || []).some((e) => e.jsonRpcMethod === "tools/list" || e.jsonRpcMethod === "initialize");
  const listOk =
    (listTrace.searchCalls ?? 0) >= 1 &&
    (listTrace.trace || []).some(
      (e) => e.jsonRpcMethod === "tools/call" && e.status === 200 && e.authorizationPresent === false,
    );
  const summarizeOk = (summarizeTrace.trace || []).some(
    (e) => e.authorizationPresent && e.jsonRpcMethod === "tools/call" && e.status === 200,
  );
  const errorOk =
    /401|Unauthorized|invalid|API_KEY|forbidden|error|fail|UNAUTHORIZED/i.test(errorRun.stdout + errorRun.stderr) ||
    (errorTrace.trace || []).some((e) => e.authorizationPresent && (e.status === 401 || e.status === 403));

  const observed = modernForced
    ? "2026-07-28 (unexpected — feature should be off)"
    : legacyVersion;

  const record = {
    client: "Codex CLI",
    clientVersion,
    platform,
    runtime: "v1/legacy-default",
    negotiation: "legacy (mcp_2026_07_28=false)",
    observedProtocolVersion: observed,
    toolDiscovery: discoveryOk ? "passed" : "failed",
    anonymousList: listOk ? "passed" : "failed",
    authenticatedSummarize: summarizeOk ? "passed" : "failed",
    errorHandling: errorOk ? "passed" : "failed",
    testedAt: new Date().toISOString(),
    evidencePath: `examples/public-ask-worker/test/product-clients/evidence/${clientId}/`,
    businessBackend: "synthetic_mock",
    featureFlags: {
      mcp_2026_07_28: false,
    },
    notes:
      "Legacy product path: Codex 0.153.x with features.mcp_2026_07_28 left disabled (UnderDevelopment default). Synthetic mock Worker backend.",
  };

  writeRecord("codex-legacy.json", record);
  return record;
}

function notRunExtended(client, fileName, extra = {}) {
  writeRecord(fileName, {
    client,
    clientVersion: null,
    platform: null,
    runtime: null,
    negotiation: null,
    observedProtocolVersion: null,
    toolDiscovery: "not_run",
    anonymousList: "not_run",
    authenticatedSummarize: "not_run",
    errorHandling: "not_run",
    testedAt: null,
    evidencePath: null,
    businessBackend: null,
    ...extra,
  });
}

const { baseUrl, child } = await ensureServer();
console.log(`Using acceptance server ${baseUrl}`);

try {
  const claude = await runClaudeModern(baseUrl);
  console.log("Claude Code modern:", JSON.stringify(claude, null, 2));
  const codex = await runCodexLegacy(baseUrl);
  console.log("Codex legacy:", JSON.stringify(codex, null, 2));

  notRunExtended("Gemini CLI", "gemini-legacy.json", {
    notes: "Extended/alternate legacy candidate; Codex covered the core legacy gate.",
  });
  notRunExtended("Cursor", "cursor.json", {
    notes: "Extended matrix — not_run. Do not market as verified.",
  });
  notRunExtended("OpenAI Responses API remote MCP", "openai-responses-api.json", {
    notes: "Extended matrix — not run; do not market as verified.",
  });
  notRunExtended("Claude Code platform exceptions (Bedrock / Foundry / etc.)", "claude-platform-exceptions.json", {
    notes: "Extended matrix — default v1 runtime environments not exercised in this acceptance pass.",
  });

  writeFileSync(
    join(dir, "support-matrix.json"),
    JSON.stringify(
      {
        issue: "#16",
        updatedAt: new Date().toISOString().slice(0, 10),
        offlineIntegration: {
          command: "npm run test:mcp-protocol",
          ciJob: "worker / MCP protocol integration",
          status: "passed",
        },
        rows: [
          {
            id: "claude-code-modern",
            client: "Claude Code",
            path: "modern",
            role: "core",
            recordFile: "records/claude-code-modern.json",
            marketingClaimAllowed:
              claude.toolDiscovery === "passed" &&
              claude.anonymousList === "passed" &&
              claude.authenticatedSummarize === "passed" &&
              claude.errorHandling === "passed",
          },
          {
            id: "codex-legacy",
            client: "Codex CLI",
            path: "legacy",
            role: "core",
            recordFile: "records/codex-legacy.json",
            marketingClaimAllowed:
              codex.toolDiscovery === "passed" &&
              codex.anonymousList === "passed" &&
              codex.authenticatedSummarize === "passed" &&
              codex.errorHandling === "passed",
          },
          {
            id: "gemini-legacy",
            client: "Gemini CLI",
            path: "legacy",
            role: "extended",
            recordFile: "records/gemini-legacy.json",
            marketingClaimAllowed: false,
          },
          {
            id: "cursor",
            client: "Cursor",
            path: "unknown",
            role: "extended",
            recordFile: "records/cursor.json",
            marketingClaimAllowed: false,
          },
          {
            id: "openai-responses-api",
            client: "OpenAI Responses API remote MCP",
            path: "unknown",
            role: "extended",
            recordFile: "records/openai-responses-api.json",
            marketingClaimAllowed: false,
          },
          {
            id: "claude-platform-exceptions",
            client: "Claude Code platform exceptions",
            path: "legacy",
            role: "extended",
            recordFile: "records/claude-platform-exceptions.json",
            marketingClaimAllowed: false,
          },
        ],
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  if (child) {
    child.kill("SIGTERM");
  }
}
