/**
 * Product-client acceptance gates. Bind CLI outcomes to server traces:
 * expected protocol path + tools/call mode + final tool result + side effects.
 */

export const MODERN_PROTOCOL = "2026-07-28";
export const LEGACY_PROTOCOLS = ["2025-11-25", "2025-06-18", "2025-03-26"];

/**
 * @typedef {{
 *   jsonRpcMethod?: string | null,
 *   status?: number,
 *   authorizationPresent?: boolean,
 *   mcpProtocolVersion?: string | null,
 *   toolIsError?: boolean | null,
 *   toolName?: string | null,
 *   askMode?: "list"|"summarize"|null,
 *   resultKind?: "final"|"incomplete"|"error"|null,
 *   hasSearchSummary?: boolean | null,
 * }} TraceEntry
 *
 * @typedef {{ searchCalls?: number, trace?: TraceEntry[] }} TracePayload
 * @typedef {"modern"|"legacy"} AcceptancePath
 */

/**
 * @param {TraceEntry} entry
 */
export function isSuccessfulToolsCall(entry) {
  return (
    entry.jsonRpcMethod === "tools/call" &&
    entry.status === 200 &&
    entry.toolIsError === false &&
    entry.resultKind === "final"
  );
}

/**
 * @param {string | null | undefined} version
 * @param {AcceptancePath} expectedPath
 */
export function protocolMatchesPath(version, expectedPath) {
  if (!version) return false;
  if (expectedPath === "modern") return version === MODERN_PROTOCOL;
  return LEGACY_PROTOCOLS.includes(version);
}

/**
 * @param {TracePayload} listTrace
 * @param {TracePayload} summarizeTrace
 * @param {AcceptancePath} expectedPath
 */
export function judgeProtocolPath(listTrace, summarizeTrace, expectedPath) {
  const successCalls = [...(listTrace.trace || []), ...(summarizeTrace.trace || [])].filter(
    isSuccessfulToolsCall,
  );
  if (successCalls.length === 0) {
    return { observedProtocolVersion: null, protocolPathOk: false };
  }
  const versions = successCalls
    .map((e) => e.mcpProtocolVersion)
    .filter((v) => typeof v === "string" && v);
  if (versions.length !== successCalls.length) {
    return { observedProtocolVersion: versions[0] ?? null, protocolPathOk: false };
  }
  const unique = [...new Set(versions)];
  if (unique.length !== 1) {
    return { observedProtocolVersion: unique.join(","), protocolPathOk: false };
  }
  const observed = unique[0];
  return {
    observedProtocolVersion: observed,
    protocolPathOk: protocolMatchesPath(observed, expectedPath),
  };
}

/**
 * @deprecated use judgeProtocolPath; kept for older tests that only need observation
 * @param {TracePayload} listTrace
 * @param {TracePayload} summarizeTrace
 */
export function judgeObservedProtocol(listTrace, summarizeTrace) {
  return judgeProtocolPath(listTrace, summarizeTrace, "modern").observedProtocolVersion
    ?? judgeProtocolPath(listTrace, summarizeTrace, "legacy").observedProtocolVersion;
}

/**
 * Anonymous list: unauthenticated final tools/call in list mode + retrieval.
 * @param {TracePayload} listTrace
 * @param {{ cliStatus?: number|null }} [opts]
 */
export function judgeAnonymousList(listTrace, opts = {}) {
  if (opts.cliStatus !== undefined && opts.cliStatus !== null && opts.cliStatus !== 0) {
    return "failed";
  }
  const searchCalls = listTrace.searchCalls ?? 0;
  const ok =
    searchCalls >= 1 &&
    (listTrace.trace || []).some(
      (e) =>
        isSuccessfulToolsCall(e) &&
        e.authorizationPresent === false &&
        (e.askMode === "list" || e.askMode === null) &&
        (e.toolName === "ask" || e.toolName === null || e.mcpName === "ask"),
    );
  return ok ? "passed" : "failed";
}

/**
 * Authenticated summarize: Authorization + summarize mode + final result with SearchSummary.
 * @param {TracePayload} summarizeTrace
 * @param {{ cliStatus?: number|null }} [opts]
 */
export function judgeSummarize(summarizeTrace, opts = {}) {
  if (opts.cliStatus !== undefined && opts.cliStatus !== null && opts.cliStatus !== 0) {
    return "failed";
  }
  const ok = (summarizeTrace.trace || []).some(
    (e) =>
      isSuccessfulToolsCall(e) &&
      e.authorizationPresent === true &&
      e.askMode === "summarize" &&
      e.hasSearchSummary === true &&
      (e.toolName === "ask" || e.toolName === null || e.mcpName === "ask"),
  );
  return ok ? "passed" : "failed";
}

/**
 * Error handling: tools/call with auth rejected via HTTP 401/403; no retrieval.
 * @param {TracePayload} errorTrace
 */
export function judgeErrorHandling(errorTrace) {
  const searchCalls = errorTrace.searchCalls ?? 0;
  if (searchCalls > 0) return "failed";
  const rejected = (errorTrace.trace || []).some(
    (e) =>
      e.jsonRpcMethod === "tools/call" &&
      e.authorizationPresent === true &&
      (e.status === 401 || e.status === 403),
  );
  return rejected ? "passed" : "failed";
}

/**
 * Modern discovery: successful server/discover and tools/list (HTTP 200).
 * @param {TracePayload} listTrace
 * @param {{ cliStatus?: number|null }} [opts]
 */
export function judgeModernDiscovery(listTrace, opts = {}) {
  if (opts.cliStatus !== undefined && opts.cliStatus !== null && opts.cliStatus !== 0) {
    return "failed";
  }
  const trace = listTrace.trace || [];
  const ok =
    trace.some((e) => e.jsonRpcMethod === "server/discover" && e.status === 200) &&
    trace.some((e) => e.jsonRpcMethod === "tools/list" && e.status === 200);
  return ok ? "passed" : "failed";
}

/**
 * @param {{ listServersStatus: number|null, listServersText: string, getServerText: string, listTrace: TracePayload, cliStatus?: number|null }} input
 */
export function judgeLegacyDiscovery(input) {
  if (input.cliStatus !== undefined && input.cliStatus !== null && input.cliStatus !== 0) {
    return "failed";
  }
  const ok =
    input.listServersStatus === 0 &&
    /refined_x_ask/i.test(input.listServersText + input.getServerText) &&
    (input.listTrace.trace || []).some(
      (e) =>
        (e.jsonRpcMethod === "tools/list" && e.status === 200) ||
        (e.jsonRpcMethod === "initialize" && e.status === 200),
    );
  return ok ? "passed" : "failed";
}

/**
 * @param {{
 *   toolDiscovery: string,
 *   anonymousList: string,
 *   authenticatedSummarize: string,
 *   errorHandling: string,
 *   observedProtocolVersion?: string | null,
 *   protocolPathOk?: boolean,
 * }} record
 * @param {AcceptancePath} [expectedPath]
 */
export function coreGatesPassed(record, expectedPath) {
  const gates =
    record.toolDiscovery === "passed" &&
    record.anonymousList === "passed" &&
    record.authenticatedSummarize === "passed" &&
    record.errorHandling === "passed";
  if (!gates) return false;
  if (expectedPath) {
    if (record.protocolPathOk === false) return false;
    if (record.protocolPathOk === true) return true;
    return protocolMatchesPath(record.observedProtocolVersion, expectedPath);
  }
  return record.protocolPathOk !== false;
}
