import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("shared contract imports from the site package tree without Worker modules", async () => {
  const mod = await import(pathToFileURL(join(root, "shared/public-ask-contract.ts")).href);
  assert.equal(mod.NLWEB_VERSION, "0.55");
  assert.equal(mod.ASK_ENTRY_DEFAULT_MODE.http, "list, summarize");
  assert.equal(mod.ASK_ENTRY_DEFAULT_MODE.mcp, "list");
  assert.equal(typeof mod.normalizeAskRequest, "function");
  const source = await (await import("node:fs/promises")).readFile(
    join(root, "shared/public-ask-contract.ts"),
    "utf8",
  );
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
