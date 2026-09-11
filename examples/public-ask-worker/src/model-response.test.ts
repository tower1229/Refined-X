import assert from "node:assert/strict";
import test from "node:test";
import { messageText } from "./model-response.ts";

test("extracts string content as the final answer", () => {
  assert.equal(messageText({ content: "  final answer  " }), "final answer");
});

test("joins array content parts into the final answer", () => {
  assert.equal(
    messageText({
      content: [{ text: "hello " }, { text: "world" }, { other: true }, "ignored"],
    }),
    "hello world",
  );
});

test("does not fall back to reasoning_content when content is empty", () => {
  assert.equal(
    messageText({
      content: "",
      reasoning_content: "internal reasoning fixture, not a final answer",
    }),
    "",
  );
});

test("does not fall back to reasoning_content when content is missing", () => {
  assert.equal(
    messageText({
      reasoning_content: "should never be published",
    }),
    "",
  );
});

test("returns empty for missing message or empty choices shape", () => {
  assert.equal(messageText(undefined), "");
  assert.equal(messageText({ content: "   " }), "");
  assert.equal(messageText({ content: [] }), "");
});
