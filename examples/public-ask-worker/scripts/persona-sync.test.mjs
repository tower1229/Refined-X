import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Worker persona module contains the content-derived cache version", async () => {
  const result = spawnSync(process.execPath, ["scripts/sync-persona.mjs", "--check"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const content = await readFile("persona.md", "utf8");
  const expected = createHash("sha256").update(content).digest("hex");
  const generated = await import(`../src/persona.generated.ts?test=${Date.now()}`);
  assert.equal(generated.publicAskPersonaVersion, expected);
});
