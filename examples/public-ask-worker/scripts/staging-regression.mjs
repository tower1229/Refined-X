const valid = JSON.stringify({ query: { text: "师兄是谁" }, prefer: { mode: "list" }, meta: { version: "0.55" } });

export const SUCCESS_CASES = [
  ["normal-list", valid],
];

export const FAILURE_CASES = [
  ["empty", ""], ["null", "null"], ["array", "[]"], ["string", '"x"'], ["number", "1"],
  ["legacy-question", '{"question":"x"}'], ["unknown-root", '{"query":{"text":"x"},"x":1}'],
  ["empty-query", '{"query":{"text":""}}'], ["missing-query", '{}'], ["query-null", '{"query":null}'],
  ["query-array", '{"query":[]}'], ["text-number", '{"query":{"text":1}}'],
  ["unknown-query", '{"query":{"text":"x","x":1}}'], ["context", '{"query":{"text":"x"},"context":[{"x":1}]}'],
  ["remember", '{"query":{"text":"x"},"meta":{"remember":true}}'], ["unknown-meta", '{"query":{"text":"x"},"meta":{"x":1}}'],
  ["bad-version", '{"query":{"text":"x"},"meta":{"version":"1"}}'], ["prefer-null", '{"query":{"text":"x"},"prefer":null}'],
  ["bad-mode", '{"query":{"text":"x"},"prefer":{"mode":"tool"}}'], ["bad-format", '{"query":{"text":"x"},"prefer":{"response_format":"xml"}}'],
  ["unknown-prefer", '{"query":{"text":"x"},"prefer":{"x":1}}'], ["stream-number", '{"query":{"text":"x"},"prefer":{"streaming":1}}'],
  ["oversized", JSON.stringify({ query: { text: "x".repeat(17 * 1024) } })],
  ["malformed-open", "{"], ["malformed-comma", '{"query":,}'], ["malformed-trailing", '{"query":{"text":"x"},}'],
  ["proto-field", '{"query":{"text":"x"},"__proto__":{}}'], ["constructor-field", '{"query":{"text":"x"},"constructor":{}}'],
  ["token-field", '{"query":{"text":"x"},"turnstile_token":1}'], ["mode-array", '{"query":{"text":"x"},"prefer":{"mode":[]}}'],
  ["language-number", '{"query":{"text":"x"},"prefer":{"accept-language":1}}'],
];

export const CASES = [...SUCCESS_CASES, ...FAILURE_CASES];

export function stagingUrl(value) {
  const url = new URL(value);
  if (!/staging/i.test(url.hostname)) throw new Error("refusing non-staging target");
  return new URL("/ask", url);
}

function parseJsonOrNull(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function responseDiagnostic(name, response, text, expected) {
  const payload = parseJsonOrNull(text);
  return {
    name,
    expected,
    status: response.status,
    responseType: payload?._meta?.response_type ?? null,
    errorCode: payload?.error?.code ?? null,
    upstreamStage: payload?.error?.detail?.stage ?? null,
    upstreamReason: payload?.error?.detail?.reason ?? null,
    internalCode: payload?.error?.detail?.internal_code ?? null,
  };
}

export async function runRegression({ endpoint, origin, fetchImpl = fetch, event }) {
  const results = [];
  let successfulLegalPaths = 0;
  for (const [expected, cases] of [["success", SUCCESS_CASES], ["failure", FAILURE_CASES]]) {
    for (const [name, body] of cases) {
      const response = await fetchImpl(endpoint, { method: "POST", headers: { "content-type": "application/json", origin }, body });
      const diagnostic = responseDiagnostic(name, response, await response.text(), expected);
      results.push(diagnostic);
      if (expected === "success") {
        if (response.ok && diagnostic.responseType === "answer") successfulLegalPaths += 1;
        else throw new Error(`${name}: legal path did not succeed ${JSON.stringify(diagnostic)}`);
      } else if (response.status >= 500) {
        throw new Error(`${name}: protocol case returned server failure ${JSON.stringify(diagnostic)}`);
      }
    }
  }
  if (successfulLegalPaths < 1) {
    throw new Error("no successful legal Public Ask path was verified");
  }
  return { event, passed: results.length, successfulLegalPaths, results };
}

async function main() {
  const endpoint = stagingUrl(process.env.PUBLIC_ASK_STAGING_URL ?? "");
  const report = await runRegression({
    endpoint,
    origin: process.env.PUBLIC_ASK_STAGING_ORIGIN ?? "https://staging.refined-x.com",
    event: "public_ask_staging_regression",
  });
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
import { pathToFileURL } from "node:url";
