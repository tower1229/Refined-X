import assert from "node:assert/strict";
import test from "node:test";
import { MIN_GROUNDING_SCORE, sourceResults } from "./retrieval.ts";

test("sourceResults drops chunks below the minimum grounding score", () => {
  const results = sourceResults({
    search_query: "test",
    chunks: [
      {
        id: "weak",
        type: "chunk",
        score: 0.46,
        text: "irrelevant",
        item: { key: "/weak", metadata: { title: "Weak" } },
      },
      {
        id: "strong",
        type: "chunk",
        score: 0.55,
        text: "relevant",
        item: { key: "/strong", metadata: { title: "Strong" } },
      },
    ],
  }, "https://refined-x.com");
  assert.equal(results.length, 1);
  assert.equal(results[0].name, "Strong");
  const grounding = results[0].grounding as { score?: number };
  assert.equal(grounding.score, 0.55);
});

test("sourceResults returns empty when every chunk is below threshold", () => {
  const results = sourceResults({
    search_query: "noise",
    chunks: [{
      id: "weak",
      type: "chunk",
      score: MIN_GROUNDING_SCORE - 0.01,
      text: "noise",
      item: { key: "/noise", metadata: { title: "Noise" } },
    }],
  }, "https://refined-x.com");
  assert.deepEqual(results, []);
});
