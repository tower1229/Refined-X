/**
 * Boot the synthetic dual-era MCP Worker for product-client acceptance.
 * Usage: node --experimental-strip-types test/product-clients/serve.mjs
 * Prints BASE_URL=… and stays up until SIGINT/SIGTERM.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { unstable_dev } from "wrangler";

const dir = dirname(fileURLToPath(import.meta.url));
const workerEntry = join(dir, "worker.ts");
const wranglerConfig = join(dir, "wrangler.jsonc");
const urlFile = join(dir, ".acceptance-base-url");

const worker = await unstable_dev(workerEntry, {
  config: wranglerConfig,
  experimental: { disableExperimentalWarning: true },
});

const baseUrl = `http://127.0.0.1:${worker.port}`;
writeFileSync(urlFile, `${baseUrl}\n`, "utf8");
console.log(`BASE_URL=${baseUrl}`);
console.log(`MCP_URL=${baseUrl}/mcp`);
console.log(`Wrote ${urlFile}`);
console.log("Synthetic mock backend — no AI Search / production credentials.");
console.log("Press Ctrl+C to stop.");

async function shutdown() {
  try {
    await worker.stop();
  } finally {
    process.exit(0);
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Keep the event loop alive.
await new Promise(() => {});
