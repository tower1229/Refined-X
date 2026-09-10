/**
 * Drive Claude Code (modern) and Codex CLI (legacy default) against the
 * synthetic acceptance Worker. Writes evidence + updates record JSON.
 *
 * Prerequisites: `node test/product-clients/serve.mjs` already running
 * (or this script boots one). Uses local product CLIs only.
 *
 * Auth: does not rewrite ANTHROPIC_BASE_URL to a third-party host by default.
 * Set ANTHROPIC_BASE_URL (and matching token/model env) explicitly when needed.
 */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  rmSync,
  chmodSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { trustedBearer, badBearer } from "../mcp-protocol/fixtures.ts";
import { validateProductClientRecord, validateSupportMatrix } from "./record-schema.ts";
import {
  coreGatesPassed,
  judgeAnonymousList,
  judgeErrorHandling,
  judgeLegacyDiscovery,
  judgeModernDiscovery,
  judgeProtocolPath,
  judgeSummarize,
} from "./acceptance-predicates.mjs";

const dir = dirname(fileURLToPath(import.meta.url));
const workerRoot = join(dir, "../..");
const repoRoot = join(workerRoot, "../..");
const urlFile = join(dir, ".acceptance-base-url");
const evidenceRoot = join(dir, "evidence");
const recordsDir = join(dir, "records");

const CODEX =
  process.env.CODEX_BIN ||
  join(process.env.HOME || "", ".codex/plugins/.plugin-appserver/codex");

const gitSha = (() => {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  const sha = (result.stdout || "").trim();
  if (result.status !== 0 || !/^[0-9a-f]{40}$/i.test(sha)) {
    throw new Error("unable to resolve git rev-parse HEAD for acceptance records");
  }
  return sha;
})();

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function writeSecureFile(path, content) {
  writeFileSync(path, content, { mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    // best-effort on platforms that ignore mode
  }
}

function mkdirSecure(path) {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  try {
    chmodSync(path, 0o700);
  } catch {
    // best-effort
  }
}

/**
 * Build Claude settings env without defaulting credentials to a third-party host.
 * Only injects ANTHROPIC_* when the caller already set them (or AUTH_TOKEN/API_KEY for token).
 */
function buildClaudeSettingsEnv() {
  const env = {
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
  };
  if (process.env.ANTHROPIC_BASE_URL) {
    env.ANTHROPIC_BASE_URL = process.env.ANTHROPIC_BASE_URL;
  }
  const token = process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY;
  if (token) {
    env.ANTHROPIC_AUTH_TOKEN = token;
  }
  for (const key of [
    "ANTHROPIC_MODEL",
    "ANTHROPIC_DEFAULT_SONNET_MODEL",
    "ANTHROPIC_DEFAULT_OPUS_MODEL",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL",
  ]) {
    if (process.env[key]) {
      env[key] = process.env[key];
    }
  }
  return env;
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
      cwd: workerRoot,
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
  return await res.json();
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

function runOfflineIntegration() {
  const result = spawnSync("npm", ["run", "test:mcp-protocol"], {
    cwd: workerRoot,
    encoding: "utf8",
    env: process.env,
    timeout: 600_000,
  });
  const status = result.status === 0 ? "passed" : "failed";
  return {
    command: "npm run test:mcp-protocol",
    ciJob: "worker / MCP protocol integration",
    status,
    gitSha,
    testedAt: new Date().toISOString(),
    stdout: result.stdout || "",
    stderr: result.stderr || "",
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
  mkdirSecure(configDir);
  const configPath = join(configDir, "claude-modern.mcp.json");
  const configAuthPath = join(configDir, "claude-modern-auth.mcp.json");
  const configBadPath = join(configDir, "claude-modern-bad.mcp.json");
  const settingsPath = join(configDir, "claude-acceptance.settings.json");
  writeSecureFile(configPath, JSON.stringify(mcpConfig, null, 2) + "\n");
  writeSecureFile(configAuthPath, JSON.stringify(mcpConfigAuth, null, 2) + "\n");
  writeSecureFile(configBadPath, JSON.stringify(mcpConfigBad, null, 2) + "\n");
  writeSecureFile(
    settingsPath,
    JSON.stringify({ env: buildClaudeSettingsEnv() }, null, 2) + "\n",
  );

  try {
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

    const protocol = judgeProtocolPath(listTrace, summarizeTrace, "modern");
    const record = {
      client: "Claude Code",
      clientVersion,
      platform,
      runtime: "v2",
      negotiation: "auto",
      observedProtocolVersion: protocol.observedProtocolVersion,
      protocolPathOk: protocol.protocolPathOk,
      expectedProtocolPath: "modern",
      toolDiscovery: judgeModernDiscovery(listTrace, { cliStatus: listRun.status }),
      anonymousList: judgeAnonymousList(listTrace, { cliStatus: listRun.status }),
      authenticatedSummarize: judgeSummarize(summarizeTrace, { cliStatus: summarizeRun.status }),
      errorHandling: judgeErrorHandling(errorTrace),
      testedAt: new Date().toISOString(),
      evidencePath: `examples/public-ask-worker/test/product-clients/evidence/${clientId}/`,
      businessBackend: "synthetic_mock",
      gitSha,
      featureFlags: {
        MCP_SDK_GENERATION: "v2",
        MCP_PROTOCOL_NEGOTIATION: "auto",
      },
      notes:
        "Modern path forced via MCP_SDK_GENERATION=v2 and MCP_PROTOCOL_NEGOTIATION=auto. Synthetic mock Worker (empty retrieval / no-reference summarize). Gates require expected protocol 2026-07-28 on successful business calls, summarize mode + SearchSummary, tools/call auth rejection, CLI status 0 on success phases, and final (not incomplete) tool results.",
    };

    writeRecord("claude-code-modern.json", record);
    return record;
  } finally {
    rmSync(configDir, { recursive: true, force: true });
  }
}

async function runCodexLegacy(baseUrl) {
  const clientId = "codex-legacy";
  const mcpUrl = `${baseUrl}/mcp`;
  assert.ok(existsSync(CODEX), `Codex binary not found at ${CODEX}`);

  const versionOut = runCapture(CODEX, ["--version"], {}, dir);
  const clientVersion = (versionOut.stdout || versionOut.stderr).trim().replace(/^codex-cli\s+/i, "") || "unknown";
  const platform = `${process.platform}/${process.arch}`;

  const codexHome = join(tmpdir(), `refined-x-codex-acceptance-${process.pid}`);
  mkdirSecure(codexHome);

  try {
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
    writeSecureFile(join(codexHome, "config.toml"), configToml);
    const userAuth = join(process.env.HOME || "", ".codex/auth.json");
    if (existsSync(userAuth)) {
      writeSecureFile(join(codexHome, "auth.json"), readFileSync(userAuth));
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
    writeSecureFile(join(codexHome, "config.toml"), authConfig);
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
    writeSecureFile(join(codexHome, "config.toml"), badConfig);
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

    const protocol = judgeProtocolPath(listTrace, summarizeTrace, "legacy");
    const modernOnSuccess = protocol.observedProtocolVersion === "2026-07-28";

    const record = {
      client: "Codex CLI",
      clientVersion,
      platform,
      runtime: "v1/legacy-default",
      negotiation: "legacy (mcp_2026_07_28=false)",
      observedProtocolVersion: modernOnSuccess
        ? "2026-07-28 (unexpected — feature should be off)"
        : protocol.observedProtocolVersion,
      protocolPathOk: protocol.protocolPathOk && !modernOnSuccess,
      expectedProtocolPath: "legacy",
      toolDiscovery: judgeLegacyDiscovery({
        listServersStatus: listServers.status,
        listServersText: listServers.stdout + listServers.stderr,
        getServerText: getServer.stdout + getServer.stderr,
        listTrace,
        cliStatus: listResult.status,
      }),
      anonymousList: judgeAnonymousList(listTrace, { cliStatus: listResult.status }),
      authenticatedSummarize: judgeSummarize(summarizeTrace, { cliStatus: summarizeRun.status }),
      errorHandling: judgeErrorHandling(errorTrace),
      testedAt: new Date().toISOString(),
      evidencePath: `examples/public-ask-worker/test/product-clients/evidence/${clientId}/`,
      businessBackend: "synthetic_mock",
      gitSha,
      featureFlags: {
        mcp_2026_07_28: false,
      },
      notes:
        "Legacy product path: Codex with features.mcp_2026_07_28 left disabled. Synthetic mock Worker. Gates require allowed 2025-* protocol on successful business calls, summarize mode + SearchSummary, tools/call auth rejection, CLI status 0 on success phases, and final tool results.",
    };

    writeRecord("codex-legacy.json", record);
    return record;
  } finally {
    rmSync(codexHome, { recursive: true, force: true });
  }
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
    gitSha: null,
    ...extra,
  });
}

const { baseUrl, child } = await ensureServer();
console.log(`Using acceptance server ${baseUrl}`);

let exitCode = 0;

try {
  console.log("Running offline MCP protocol integration…");
  const offline = runOfflineIntegration();
  if (offline.status !== "passed") {
    console.error("offlineIntegration failed");
    console.error(offline.stderr || offline.stdout);
    exitCode = 1;
  } else {
    console.log("offlineIntegration: passed");
  }

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

  if (!coreGatesPassed(claude, "modern") || !coreGatesPassed(codex, "legacy")) {
    exitCode = 1;
  }
  if (offline.status !== "passed") {
    exitCode = 1;
  }

  const matrix = {
    issue: "#16",
    updatedAt: new Date().toISOString().slice(0, 10),
    offlineIntegration: {
      command: offline.command,
      ciJob: offline.ciJob,
      status: offline.status,
      gitSha: offline.gitSha,
      testedAt: offline.testedAt,
    },
    rows: [
      {
        id: "claude-code-modern",
        client: "Claude Code",
        path: "modern",
        role: "core",
        recordFile: "records/claude-code-modern.json",
        marketingClaimAllowed: coreGatesPassed(claude, "modern") && offline.status === "passed",
      },
      {
        id: "codex-legacy",
        client: "Codex CLI",
        path: "legacy",
        role: "core",
        recordFile: "records/codex-legacy.json",
        marketingClaimAllowed: coreGatesPassed(codex, "legacy") && offline.status === "passed",
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
  };
  const matrixErrors = validateSupportMatrix(matrix);
  if (matrixErrors.length) {
    throw new Error(`invalid support matrix: ${matrixErrors.join("; ")}`);
  }
  writeFileSync(join(dir, "support-matrix.json"), JSON.stringify(matrix, null, 2) + "\n");
} catch (err) {
  console.error(err);
  exitCode = 1;
} finally {
  if (child) {
    child.kill("SIGTERM");
  }
}

process.exit(exitCode);
