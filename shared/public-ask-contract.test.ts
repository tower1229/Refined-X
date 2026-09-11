import assert from "node:assert/strict";
import test from "node:test";
import {
  ASK_ENTRY_DEFAULT_MODE,
  ASK_RAW_INPUT_SCHEMA,
  NLWEB_VERSION,
  PUBLIC_ASK_CAPABILITY,
  PUBLIC_ASK_SUPPORTED,
  PUBLIC_ASK_UNSUPPORTED,
  QUERY_TEXT_MAX_CODE_POINTS,
  RequestProblem,
  normalizeAskRequest,
  responseModes,
} from "./public-ask-contract.ts";

test("entry defaults keep HTTP list+summarize and MCP list (including empty string)", () => {
  assert.equal(ASK_ENTRY_DEFAULT_MODE.http, "list, summarize");
  assert.equal(ASK_ENTRY_DEFAULT_MODE.mcp, "list");

  const http = normalizeAskRequest({ query: { text: "hello" } }, "http");
  assert.deepEqual(responseModes(http.prefer?.mode, "http"), ["list", "summarize"]);

  const mcpMissing = normalizeAskRequest({ query: { text: "hello" } }, "mcp");
  assert.equal(mcpMissing.prefer?.mode, "list");
  assert.deepEqual(responseModes(mcpMissing.prefer?.mode, "mcp"), ["list"]);

  const mcpEmpty = normalizeAskRequest({ query: { text: "hello" }, prefer: { mode: "" } }, "mcp");
  assert.equal(mcpEmpty.prefer?.mode, "list");
});

test("explicit prefer.mode uses the same normalize path for both entries", () => {
  for (const entry of ["http", "mcp"] as const) {
    const request = normalizeAskRequest(
      { query: { text: "x" }, prefer: { mode: " summarize , list " } },
      entry,
    );
    assert.deepEqual(responseModes(request.prefer?.mode, entry), ["summarize", "list"]);
  }
});

test("Unicode trim and 1–500 code-point rules cover CJK, emoji, and boundaries", () => {
  const emoji500 = "😀".repeat(QUERY_TEXT_MAX_CODE_POINTS);
  const padded = normalizeAskRequest({ query: { text: `  ${emoji500}  ` } }, "http");
  assert.equal(padded.query.text, emoji500);
  assert.equal([...padded.query.text].length, QUERY_TEXT_MAX_CODE_POINTS);

  assert.throws(
    () => normalizeAskRequest({ query: { text: `${emoji500}😀` } }, "http"),
    (error: unknown) => error instanceof RequestProblem && error.code === "INVALID_QUERY",
  );
  assert.throws(
    () => normalizeAskRequest({ query: { text: "   " } }, "mcp"),
    (error: unknown) => error instanceof RequestProblem && error.code === "INVALID_QUERY",
  );

  const cjk = normalizeAskRequest({ query: { text: "  师兄是谁？  " } }, "http");
  assert.equal(cjk.query.text, "师兄是谁？");
});

test("mode parsing quirks: order, duplicates, blanks, and comma-only strings", () => {
  assert.deepEqual(responseModes("list,list", "http"), ["list", "list"]);
  assert.deepEqual(responseModes(" summarize , list ", "http"), ["summarize", "list"]);
  assert.deepEqual(responseModes("   ", "http"), []);
  assert.deepEqual(responseModes(",,,", "mcp"), []);
  assert.deepEqual(responseModes(undefined, "http"), ["list", "summarize"]);
  assert.deepEqual(responseModes(undefined, "mcp"), ["list"]);
  assert.deepEqual(responseModes("", "mcp"), ["list"]);
  assert.deepEqual(responseModes("", "http"), []);
});

test("rejects empty context extensions, unknown fields, and illegal prefer.mode types", () => {
  assert.throws(
    () => normalizeAskRequest({ query: { text: "x" }, context: { previous: "y" } }, "http"),
    (error: unknown) =>
      error instanceof RequestProblem &&
      error.code === "INVALID_QUERY" &&
      error.message.includes("context.previous"),
  );
  assert.throws(
    () => normalizeAskRequest({ query: { text: "x" }, prefer: { mode: ["summarize"] } }, "mcp"),
    (error: unknown) =>
      error instanceof RequestProblem &&
      error.code === "INVALID_QUERY" &&
      error.message.includes("prefer.mode must be a string"),
  );
  assert.throws(
    () => normalizeAskRequest({ query: { text: "x" }, prefer: { mode: null } }, "mcp"),
    (error: unknown) => error instanceof RequestProblem && error.code === "INVALID_QUERY",
  );
  assert.throws(
    () => normalizeAskRequest({ query: { text: "x" }, prefer: null }, "mcp"),
    (error: unknown) =>
      error instanceof RequestProblem &&
      error.code === "INVALID_QUERY" &&
      error.message.includes("prefer must be an object"),
  );
  assert.throws(
    () => normalizeAskRequest({ query: { text: "x" }, prefer: { mode: "generate" } }, "http"),
    (error: unknown) => error instanceof RequestProblem && error.code === "UNSUPPORTED_MODE",
  );
});

test("raw input schema is the single capability/version source without mode enum", () => {
  assert.equal(NLWEB_VERSION, "0.55");
  assert.match(PUBLIC_ASK_CAPABILITY, /NLWeb v0\.55/);
  assert.match(PUBLIC_ASK_SUPPORTED, /list/);
  assert.match(PUBLIC_ASK_UNSUPPORTED, /long-term memory/);
  assert.equal(ASK_RAW_INPUT_SCHEMA.properties.meta.properties.version.const, NLWEB_VERSION);
  assert.equal(ASK_RAW_INPUT_SCHEMA.properties.prefer.properties.mode.type, "string");
  assert.equal("enum" in ASK_RAW_INPUT_SCHEMA.properties.prefer.properties.mode, false);
  assert.deepEqual(ASK_RAW_INPUT_SCHEMA.properties.prefer.properties.mode.examples, [
    "list",
    "summarize",
    "list, summarize",
  ]);
  assert.match(
    ASK_RAW_INPUT_SCHEMA.properties.query.properties.text.description ?? "",
    /1–500 Unicode code points/,
  );
  assert.equal("maxLength" in ASK_RAW_INPUT_SCHEMA.properties.query.properties.text, false);
});
