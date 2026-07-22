import assert from "node:assert/strict";
import test from "node:test";
import { CASES, responseDiagnostic, runRegression, stagingUrl } from "./staging-regression.mjs";

test("staging regression contains at least 30 normal and malicious variants", () => {
  assert.ok(CASES.length >= 30);
  assert.ok(CASES.some(([name]) => name.startsWith("normal")));
  assert.ok(CASES.some(([name]) => name.startsWith("malformed")));
});

test("staging regression refuses production and non-staging targets", () => {
  assert.throws(() => stagingUrl("https://ask.refined-x.com"), /refusing non-staging/);
  assert.equal(stagingUrl("https://refined-x-public-ask-staging.example.workers.dev").pathname, "/ask");
});

test("regression verifies a successful legal answer path and reports protocol failures", async () => {
  const report = await runRegression({
    endpoint: new URL("https://staging.example.test/ask"),
    origin: "https://staging.refined-x.com",
    event: "test_regression",
    async fetchImpl(_endpoint, init) {
      const body = String(init.body);
      if (body.includes("师兄是谁")) {
        return Response.json({ _meta: { response_type: "answer" }, results: [] });
      }
      return Response.json({
        _meta: { response_type: "failure" },
        error: { code: "INVALID_QUERY", message: "invalid" },
      }, { status: 400 });
    },
  });
  assert.equal(report.successfulLegalPaths, 1);
  assert.equal(report.passed, CASES.length);
  assert.ok(report.results.some((item) => item.expected === "failure" && item.errorCode === "INVALID_QUERY"));
});

test("regression failure output distinguishes upstream availability from validation errors", async () => {
  await assert.rejects(
    () => runRegression({
      endpoint: new URL("https://staging.example.test/ask"),
      origin: "https://staging.refined-x.com",
      event: "test_regression",
      async fetchImpl() {
        return Response.json({
          _meta: { response_type: "failure" },
          error: {
            code: "UPSTREAM_TIMEOUT",
            message: "timeout",
            detail: { stage: "retrieval", reason: "timeout", internal_code: "AI_SEARCH_TIMEOUT" },
          },
        }, { status: 504 });
      },
    }),
    /"upstreamStage":"retrieval".*"upstreamReason":"timeout".*"internalCode":"AI_SEARCH_TIMEOUT"/,
  );
});

test("response diagnostics include upstream detail when present", () => {
  const response = new Response("", { status: 502 });
  const diagnostic = responseDiagnostic("normal-list", response, JSON.stringify({
    _meta: { response_type: "failure" },
    error: {
      code: "UPSTREAM_ERROR",
      detail: { stage: "model", reason: "failure", internal_code: "MODEL_FAILED" },
    },
  }), "success");
  assert.deepEqual(diagnostic, {
    name: "normal-list",
    expected: "success",
    status: 502,
    responseType: "failure",
    errorCode: "UPSTREAM_ERROR",
    upstreamStage: "model",
    upstreamReason: "failure",
    internalCode: "MODEL_FAILED",
  });
});
