import assert from "node:assert/strict";
import test from "node:test";
import {
  coreGatesPassed,
  judgeAnonymousList,
  judgeErrorHandling,
  judgeModernDiscovery,
  judgeProtocolPath,
  judgeSummarize,
  requireSuccessfulCli,
} from "./acceptance-predicates.mjs";
import { interpretToolsCallBody, parseToolsCallRequest } from "./tools-call-body.ts";

const okCli = { cliStatus: 0 as const };

test("interpretToolsCallBody treats omitted isError as final success", () => {
  const ok = interpretToolsCallBody(
    JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      result: {
        content: [{ type: "text", text: JSON.stringify({ results: [{ "@type": "SearchSummary", text: "x" }] }) }],
        structuredContent: { results: [{ "@type": "SearchSummary", text: "x" }] },
      },
    }),
    "application/json",
  );
  assert.equal(ok.toolIsError, false);
  assert.equal(ok.resultKind, "final");
  assert.equal(ok.hasSearchSummary, true);
});

test("interpretToolsCallBody marks input_required as incomplete not success", () => {
  const incomplete = interpretToolsCallBody(
    JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      result: { resultType: "input_required", content: [] },
    }),
    "application/json",
  );
  assert.equal(incomplete.resultKind, "incomplete");
  assert.equal(incomplete.toolIsError, false);
});

test("truncated SSE with result keywords stays unparsed", () => {
  const truncated = interpretToolsCallBody(
    `event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"structuredContent":{"results":[{"@type":"SearchSummary"`,
    "text/event-stream",
  );
  assert.equal(truncated.resultKind, null);
  assert.equal(truncated.toolIsError, null);
  assert.equal(truncated.hasSearchSummary, null);
});

test("parseToolsCallRequest extracts summarize mode", () => {
  const parsed = parseToolsCallRequest(
    JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "ask",
        arguments: { query: { text: "x" }, prefer: { mode: "summarize" } },
      },
    }),
  );
  assert.equal(parsed.askMode, "summarize");
  assert.equal(parsed.toolName, "ask");
});

test("errorHandling fails when CLI has error text but no MCP rejection", () => {
  assert.equal(judgeErrorHandling({ searchCalls: 0, trace: [] }), "failed");
});

test("errorHandling requires tools/call 401/403 not discover rejection", () => {
  assert.equal(
    judgeErrorHandling({
      searchCalls: 0,
      trace: [
        {
          jsonRpcMethod: "server/discover",
          authorizationPresent: true,
          status: 401,
          toolIsError: null,
        },
      ],
    }),
    "failed",
  );
  assert.equal(
    judgeErrorHandling({
      searchCalls: 0,
      trace: [
        {
          jsonRpcMethod: "tools/call",
          authorizationPresent: true,
          status: 401,
          toolIsError: null,
          askMode: "summarize",
        },
      ],
    }),
    "passed",
  );
});

test("summarize fails on HTTP 200 with toolIsError true", () => {
  assert.equal(
    judgeSummarize(
      {
        searchCalls: 1,
        trace: [
          {
            jsonRpcMethod: "tools/call",
            authorizationPresent: true,
            status: 200,
            toolIsError: true,
            resultKind: "error",
            askMode: "summarize",
            hasSearchSummary: false,
            toolName: "ask",
            mcpProtocolVersion: "2026-07-28",
          },
        ],
      },
      okCli,
    ),
    "failed",
  );
});

test("summarize fails when authenticated call used list mode", () => {
  assert.equal(
    judgeSummarize(
      {
        searchCalls: 1,
        trace: [
          {
            jsonRpcMethod: "tools/call",
            authorizationPresent: true,
            status: 200,
            toolIsError: false,
            resultKind: "final",
            askMode: "list",
            hasSearchSummary: false,
            toolName: "ask",
            mcpProtocolVersion: "2026-07-28",
          },
        ],
      },
      okCli,
    ),
    "failed",
  );
});

test("summarize requires SearchSummary on final result", () => {
  assert.equal(
    judgeSummarize(
      {
        searchCalls: 0,
        trace: [
          {
            jsonRpcMethod: "tools/call",
            authorizationPresent: true,
            status: 200,
            toolIsError: false,
            resultKind: "final",
            askMode: "summarize",
            hasSearchSummary: true,
            toolName: "ask",
            mcpProtocolVersion: "2026-07-28",
          },
        ],
      },
      okCli,
    ),
    "passed",
  );
});

test("modern path gates fail when successful calls used legacy protocol", () => {
  const listTrace = {
    searchCalls: 1,
    trace: [
      { jsonRpcMethod: "server/discover", status: 400, mcpProtocolVersion: "2026-07-28" },
      { jsonRpcMethod: "tools/list", status: 200, mcpProtocolVersion: "2025-06-18" },
      {
        jsonRpcMethod: "tools/call",
        status: 200,
        authorizationPresent: false,
        toolIsError: false,
        resultKind: "final",
        askMode: "list",
        toolName: "ask",
        hasSearchSummary: false,
        mcpProtocolVersion: "2025-06-18",
      },
    ],
  };
  const summarizeTrace = {
    searchCalls: 0,
    trace: [
      {
        jsonRpcMethod: "tools/call",
        status: 200,
        authorizationPresent: true,
        toolIsError: false,
        resultKind: "final",
        askMode: "summarize",
        hasSearchSummary: true,
        toolName: "ask",
        mcpProtocolVersion: "2025-06-18",
      },
    ],
  };
  const protocol = judgeProtocolPath(listTrace, summarizeTrace, "modern");
  assert.equal(protocol.observedProtocolVersion, "2025-06-18");
  assert.equal(protocol.protocolPathOk, false);

  const record = {
    toolDiscovery: judgeModernDiscovery(listTrace, okCli),
    anonymousList: judgeAnonymousList(listTrace, okCli),
    authenticatedSummarize: judgeSummarize(summarizeTrace, okCli),
    errorHandling: "passed",
    observedProtocolVersion: protocol.observedProtocolVersion,
    protocolPathOk: protocol.protocolPathOk,
  };
  // Discovery may still "pass" if tools/list 200 exists — but marketing must fail on protocol path.
  assert.equal(coreGatesPassed(record, "modern"), false);
  assert.equal(
    coreGatesPassed(
      {
        toolDiscovery: "passed",
        anonymousList: "passed",
        authenticatedSummarize: "passed",
        errorHandling: "passed",
        observedProtocolVersion: "2026-07-28",
        protocolPathOk: true,
      },
      "modern",
    ),
    true,
  );
});

test("mixed list/summarize protocol versions fail protocol path", () => {
  const protocol = judgeProtocolPath(
    {
      searchCalls: 1,
      trace: [
        {
          jsonRpcMethod: "tools/call",
          status: 200,
          toolIsError: false,
          resultKind: "final",
          askMode: "list",
          mcpProtocolVersion: "2026-07-28",
          authorizationPresent: false,
        },
      ],
    },
    {
      searchCalls: 0,
      trace: [
        {
          jsonRpcMethod: "tools/call",
          status: 200,
          toolIsError: false,
          resultKind: "final",
          askMode: "summarize",
          hasSearchSummary: true,
          mcpProtocolVersion: "2025-06-18",
          authorizationPresent: true,
        },
      ],
    },
    "modern",
  );
  assert.equal(protocol.protocolPathOk, false);
});

test("modern discovery requires HTTP 200 on discover and tools/list", () => {
  assert.equal(
    judgeModernDiscovery(
      {
        trace: [
          { jsonRpcMethod: "server/discover", status: 400 },
          { jsonRpcMethod: "tools/list", status: 200 },
        ],
      },
      okCli,
    ),
    "failed",
  );
  assert.equal(
    judgeModernDiscovery(
      {
        trace: [
          { jsonRpcMethod: "server/discover", status: 200 },
          { jsonRpcMethod: "tools/list", status: 200 },
        ],
      },
      okCli,
    ),
    "passed",
  );
});

test("anonymousList requires successful unauthenticated tools/call and search", () => {
  assert.equal(
    judgeAnonymousList(
      {
        searchCalls: 1,
        trace: [
          {
            jsonRpcMethod: "tools/call",
            status: 200,
            authorizationPresent: false,
            toolIsError: false,
            resultKind: "final",
            askMode: "list",
            toolName: "ask",
          },
        ],
      },
      okCli,
    ),
    "passed",
  );
  assert.equal(
    judgeAnonymousList(
      {
        searchCalls: 1,
        trace: [
          {
            jsonRpcMethod: "tools/call",
            status: 200,
            authorizationPresent: false,
            toolIsError: false,
            resultKind: "final",
            askMode: "list",
            toolName: "ask",
          },
        ],
      },
      { cliStatus: 1 },
    ),
    "failed",
  );
});

test("CLI null status / signal / error fail success-phase gates", () => {
  const goodList = {
    searchCalls: 1,
    trace: [
      {
        jsonRpcMethod: "tools/call",
        status: 200,
        authorizationPresent: false,
        toolIsError: false,
        resultKind: "final",
        askMode: "list",
        toolName: "ask",
      },
    ],
  };
  const goodDiscover = {
    trace: [
      { jsonRpcMethod: "server/discover", status: 200 },
      { jsonRpcMethod: "tools/list", status: 200 },
    ],
  };
  const goodSummarize = {
    searchCalls: 0,
    trace: [
      {
        jsonRpcMethod: "tools/call",
        status: 200,
        authorizationPresent: true,
        toolIsError: false,
        resultKind: "final",
        askMode: "summarize",
        hasSearchSummary: true,
        toolName: "ask",
        mcpProtocolVersion: "2026-07-28",
      },
    ],
  };

  assert.equal(requireSuccessfulCli({ cliStatus: null }), false);
  assert.equal(requireSuccessfulCli({ cliStatus: null, cliSignal: "SIGTERM", cliError: "ETIMEDOUT" }), false);
  assert.equal(requireSuccessfulCli({ cliStatus: 0, cliSignal: "SIGTERM" }), false);
  assert.equal(requireSuccessfulCli({ cliStatus: 0, cliError: "spawn EACCES" }), false);
  assert.equal(requireSuccessfulCli(okCli), true);

  assert.equal(judgeAnonymousList(goodList, { cliStatus: null, cliSignal: "SIGTERM" }), "failed");
  assert.equal(judgeModernDiscovery(goodDiscover, { cliStatus: null, cliError: "ETIMEDOUT" }), "failed");
  assert.equal(judgeSummarize(goodSummarize, { cliStatus: null }), "failed");
  assert.equal(judgeAnonymousList(goodList), "failed");

  assert.equal(
    coreGatesPassed(
      {
        toolDiscovery: judgeModernDiscovery(goodDiscover, {
          cliStatus: null,
          cliSignal: "SIGTERM",
          cliError: "ETIMEDOUT",
        }),
        anonymousList: judgeAnonymousList(goodList, {
          cliStatus: null,
          cliSignal: "SIGTERM",
          cliError: "ETIMEDOUT",
        }),
        authenticatedSummarize: judgeSummarize(goodSummarize, {
          cliStatus: null,
          cliSignal: "SIGTERM",
          cliError: "ETIMEDOUT",
        }),
        errorHandling: "passed",
        protocolPathOk: true,
      },
      "modern",
    ),
    false,
  );
});

test("incomplete tool result is not a successful tools/call", () => {
  assert.equal(
    judgeSummarize(
      {
        searchCalls: 0,
        trace: [
          {
            jsonRpcMethod: "tools/call",
            status: 200,
            authorizationPresent: true,
            toolIsError: false,
            resultKind: "incomplete",
            askMode: "summarize",
            hasSearchSummary: false,
            toolName: "ask",
          },
        ],
      },
      okCli,
    ),
    "failed",
  );
});
