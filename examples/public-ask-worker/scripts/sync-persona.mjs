import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

const source = resolve("persona.md");
const target = resolve("src/persona.generated.ts");
const content = await readFile(source, "utf8");
const version = createHash("sha256").update(content).digest("hex");
const generated = `// Generated from ../persona.md by scripts/sync-persona.mjs. Do not edit.\nexport const publicAskPersonaVersion = ${JSON.stringify(version)};\nexport default ${JSON.stringify(content)};\n`;

if (process.argv.includes("--check")) {
  const current = await readFile(target, "utf8").catch(() => "");
  if (current !== generated) {
    console.error("persona.generated.ts is stale; run npm run sync:persona");
    process.exitCode = 1;
  }
} else {
  await writeFile(target, generated, "utf8");
}
