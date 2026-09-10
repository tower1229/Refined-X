import assert from "node:assert/strict";
import test from "node:test";
import {
  judgeAnonymousList,
  judgeErrorHandling,
  judgeObservedProtocol,
  judgeSummarize,
} from "./acceptance-predicates.mjs";
import { interpretToolsCallBody } from "./tools-call-body.ts";

test("interpretToolsCallBody treats omitted isError as success", () => {
  assert.equal(
    interpretToolsCallBody(
      JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: "{}" }] } }),
      "application/json",
    ),
    false,
  );
  assert.equal(
    interpretToolsCallBody(
      JSON.stringify({ jsonrpc: "2.0", id: 1, result: { isError: true, content: [] } }),
      "application/json",
    ),
    true,
  );
});

test("interpretToolsCallBody reads SSE tool results without explicit isError", () => {
  const sse = [
    "event: message",
    'data: {"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"{}"}]}}',
    "",
    "",
  ].join("\n");
  assert.equal(interpretToolsCallBody(sse, "text/event-stream"), false);
  assert.equal(
    interpretToolsCallBody(
      'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"isError":true,"content":[]}}\n\n',
      "text/event-stream",
    ),
    true,
  );
});

test("errorHandling fails when CLI has error text but no MCP rejection", () => {
  const errorTrace = {
    searchCalls: 0,
    trace: [],
  };
  // Counterexample: model connection error, no MCP call — must not pass.
  assert.equal(judgeErrorHandling(errorTrace), "failed");
});

test("errorHandling passes only on HTTP 401/403 with auth and no retrieval", () => {
  assert.equal(
    judgeErrorHandling({
      searchCalls: 0,
      trace: [{ jsonRpcMethod: "tools/call", authorizationPresent: true, status: 401, toolIsError: null }],
    }),
    "passed",
  );
  assert.equal(
    judgeErrorHandling({
      searchCalls: 1,
      trace: [{ jsonRpcMethod: "tools/call", authorizationPresent: true, status: 401, toolIsError: null }],
    }),
    "failed",
  );
});

test("summarize fails on HTTP 200 with toolIsError true", () => {
  // Counterexample: business tool failure returned as HTTP 200 + isError.
  assert.equal(
    judgeSummarize({
      searchCalls: 1,
      trace: [
        {
          jsonRpcMethod: "tools/call",
          authorizationPresent: true,
          status: 200,
          toolIsError: true,
          mcpProtocolVersion: "2026-07-28",
        },
      ],
    }),
    "failed",
  );
  assert.equal(
    judgeSummarize({
      searchCalls: 1,
      trace: [
        {
          jsonRpcMethod: "tools/call",
          authorizationPresent: true,
          status: 200,
          toolIsError: false,
          mcpProtocolVersion: "2026-07-28",
        },
      ],
    }),
    "passed",
  );
});

test("observed protocol uses successful business call, not probe-only modern", () => {
  // Counterexample: modern probe failed; successful call used legacy.
  const listTrace = {
    searchCalls: 1,
    trace: [
      { jsonRpcMethod: "server/discover", status: 400, mcpProtocolVersion: "2026-07-28", toolIsError: null },
      {
        jsonRpcMethod: "tools/call",
        status: 200,
        authorizationPresent: false,
        toolIsError: false,
        mcpProtocolVersion: "2025-06-18",
      },
    ],
  };
  const summarizeTrace = { searchCalls: 0, trace: [] };
  assert.equal(judgeObservedProtocol(listTrace, summarizeTrace), "2025-06-18");
});

test("anonymousList requires successful unauthenticated tools/call and search", () => {
  assert.equal(
    judgeAnonymousList({
      searchCalls: 0,
      trace: [
        {
          jsonRpcMethod: "tools/call",
          status: 200,
          authorizationPresent: false,
          toolIsError: false,
        },
      ],
    }),
    "failed",
  );
  assert.equal(
    judgeAnonymousList({
      searchCalls: 1,
      trace: [
        {
          jsonRpcMethod: "tools/call",
          status: 200,
          authorizationPresent: false,
          toolIsError: false,
        },
      ],
    }),
    "passed",
  );
});
