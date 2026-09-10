/**
 * Product-client acceptance gates. Bind CLI outcomes to server traces:
 * tools/call + HTTP status + toolIsError + business side effects.
 */

/**
 * @typedef {{
 *   jsonRpcMethod?: string | null,
 *   status?: number,
 *   authorizationPresent?: boolean,
 *   mcpProtocolVersion?: string | null,
 *   toolIsError?: boolean | null,
 * }} TraceEntry
 *
 * @typedef {{ searchCalls?: number, trace?: TraceEntry[] }} TracePayload
 */

/**
 * @param {TraceEntry} entry
 */
export function isSuccessfulToolsCall(entry) {
  return (
    entry.jsonRpcMethod === "tools/call" &&
    entry.status === 200 &&
    entry.toolIsError === false
  );
}

/**
 * Anonymous list: at least one successful unauthenticated tools/call and retrieval.
 * @param {TracePayload} listTrace
 * @returns {"passed"|"failed"}
 */
export function judgeAnonymousList(listTrace) {
  const searchCalls = listTrace.searchCalls ?? 0;
  const ok =
    searchCalls >= 1 &&
    (listTrace.trace || []).some(
      (e) => isSuccessfulToolsCall(e) && e.authorizationPresent === false,
    );
  return ok ? "passed" : "failed";
}

/**
 * Authenticated summarize: successful tools/call with Authorization and no tool error.
 * @param {TracePayload} summarizeTrace
 * @returns {"passed"|"failed"}
 */
export function judgeSummarize(summarizeTrace) {
  const ok = (summarizeTrace.trace || []).some(
    (e) => isSuccessfulToolsCall(e) && e.authorizationPresent === true,
  );
  return ok ? "passed" : "failed";
}

/**
 * Error handling: expected HTTP 401/403 on an authorized request, and no retrieval.
 * CLI text alone is never sufficient (avoids model-connection false positives).
 * @param {TracePayload} errorTrace
 * @returns {"passed"|"failed"}
 */
export function judgeErrorHandling(errorTrace) {
  const searchCalls = errorTrace.searchCalls ?? 0;
  if (searchCalls > 0) return "failed";
  const rejected = (errorTrace.trace || []).some(
    (e) => e.authorizationPresent === true && (e.status === 401 || e.status === 403),
  );
  return rejected ? "passed" : "failed";
}

/**
 * Protocol version from successful business tools/call only (list + summarize).
 * Probe-only modern headers / server/discover do not count.
 * @param {TracePayload} listTrace
 * @param {TracePayload} summarizeTrace
 * @returns {string | null}
 */
export function judgeObservedProtocol(listTrace, summarizeTrace) {
  const successCalls = [...(listTrace.trace || []), ...(summarizeTrace.trace || [])].filter(
    isSuccessfulToolsCall,
  );
  for (const entry of successCalls) {
    if (typeof entry.mcpProtocolVersion === "string" && entry.mcpProtocolVersion) {
      return entry.mcpProtocolVersion;
    }
  }
  return null;
}

/**
 * Modern discovery: both server/discover and tools/list observed.
 * @param {TracePayload} listTrace
 * @returns {"passed"|"failed"}
 */
export function judgeModernDiscovery(listTrace) {
  const trace = listTrace.trace || [];
  const ok =
    trace.some((e) => e.jsonRpcMethod === "server/discover") &&
    trace.some((e) => e.jsonRpcMethod === "tools/list");
  return ok ? "passed" : "failed";
}

/**
 * Legacy discovery helpers (Codex): CLI listed server + initialize or tools/list on wire.
 * @param {{ listServersStatus: number|null, listServersText: string, getServerText: string, listTrace: TracePayload }} input
 * @returns {"passed"|"failed"}
 */
export function judgeLegacyDiscovery(input) {
  const ok =
    input.listServersStatus === 0 &&
    /refined_x_ask/i.test(input.listServersText + input.getServerText) &&
    (input.listTrace.trace || []).some(
      (e) => e.jsonRpcMethod === "tools/list" || e.jsonRpcMethod === "initialize",
    );
  return ok ? "passed" : "failed";
}

/**
 * @param {ProductClientRecordLike} record
 * @typedef {{ toolDiscovery: string, anonymousList: string, authenticatedSummarize: string, errorHandling: string }} ProductClientRecordLike
 */
export function coreGatesPassed(record) {
  return (
    record.toolDiscovery === "passed" &&
    record.anonymousList === "passed" &&
    record.authenticatedSummarize === "passed" &&
    record.errorHandling === "passed"
  );
}
