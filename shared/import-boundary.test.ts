import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { copyFile, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const contractSource = join(root, "shared/public-ask-contract.ts");

test("shared contract imports from the site package tree without Worker modules", async () => {
  const mod = await import(pathToFileURL(join(root, "shared/public-ask-contract.ts")).href);
  assert.equal(mod.NLWEB_VERSION, "0.55");
  assert.equal(mod.ASK_ENTRY_DEFAULT_MODE.http, "list, summarize");
  assert.equal(mod.ASK_ENTRY_DEFAULT_MODE.mcp, "list");
  assert.equal(typeof mod.normalizeAskRequest, "function");
  const source = await (await import("node:fs/promises")).readFile(contractSource, "utf8");
  assert.doesNotMatch(source, /examples\/public-ask-worker|astro:|cloudflare:|process\.env|Env\b/);
});

test("shared contract imports from the Worker package tree via relative path", async () => {
  const workerRequire = createRequire(join(root, "examples/public-ask-worker/package.json"));
  assert.ok(workerRequire.resolve("typescript"));
  const mod = await import(
    pathToFileURL(join(root, "examples/public-ask-worker/src/protocol.ts")).href
  );
  const request = mod.normalizeAskRequest({ query: { text: "ping" } }, "mcp");
  assert.equal(request.prefer?.mode, "list");
});

test("shared contract imports after independent site-like and worker-like package installs", async () => {
  const parent = await mkdtemp(join(tmpdir(), "refined-x-ask-contract-"));
  try {
    for (const label of ["site-package", "worker-package"] as const) {
      const pkgDir = join(parent, label);
      await mkdir(pkgDir, { recursive: true });
      await writeFile(
        join(pkgDir, "package.json"),
        JSON.stringify({ name: `refined-x-${label}`, private: true, type: "module" }),
      );
      await copyFile(contractSource, join(pkgDir, "public-ask-contract.ts"));
      await writeFile(
        join(pkgDir, "importer.mjs"),
        `
import {
  ASK_ENTRY_DEFAULT_MODE,
  NLWEB_VERSION,
  normalizeAskRequest,
} from "./public-ask-contract.ts";

const http = normalizeAskRequest({ query: { text: "hello" } }, "http");
const mcp = normalizeAskRequest({ query: { text: "hello" }, prefer: { mode: "" } }, "mcp");
if (NLWEB_VERSION !== "0.55") throw new Error("bad version");
if (ASK_ENTRY_DEFAULT_MODE.http !== "list, summarize") throw new Error("bad http default");
if (ASK_ENTRY_DEFAULT_MODE.mcp !== "list") throw new Error("bad mcp default");
if (mcp.prefer?.mode !== "list") throw new Error("mcp empty mode default failed");
if (http.query.text !== "hello") throw new Error("normalize failed");
console.log(JSON.stringify({ ok: true, package: ${JSON.stringify(label)} }));
`,
      );
      const result = spawnSync(process.execPath, ["importer.mjs"], {
        cwd: pkgDir,
        encoding: "utf8",
      });
      assert.equal(result.status, 0, `${label} import failed: ${result.stderr || result.stdout}`);
      assert.match(result.stdout, /"ok":true/);
    }
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
