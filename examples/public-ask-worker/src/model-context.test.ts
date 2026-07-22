import assert from "node:assert/strict";
import test from "node:test";
import { buildBoundedModelContext } from "./model-context.ts";
import type { NlWebResult } from "./protocol.ts";

test("limits each source body to 1200 characters and the total context to 10 KiB", () => {
  const sources: NlWebResult[] = Array.from({ length: 8 }, (_, index) => ({
    "@type": "Article",
    name: `source-${index}`,
    url: `https://refined-x.com/${index}`,
    description: "汉".repeat(5000),
  }));
  const context = buildBoundedModelContext(sources);
  assert.ok(new TextEncoder().encode(context).byteLength <= 10 * 1024);
  const parsed = JSON.parse(context) as Array<{ text: string }>;
  assert.equal(parsed.length, 8);
  assert.ok(parsed.every((source) => [...source.text].length <= 1200));
});

test("preserves source identity and valid UTF-8 while fitting the total budget", () => {
  const context = buildBoundedModelContext([{
    "@type": "Article",
    name: "证据",
    url: "https://refined-x.com/evidence",
    description: "🙂".repeat(4000),
  }]);
  assert.doesNotMatch(context, /�/);
  assert.match(context, /refined-x\.com\/evidence/);
});
