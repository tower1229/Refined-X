import assert from "node:assert/strict";
import test from "node:test";
import { verifyBrowserChallenge } from "./access-guard.ts";

test("verifies Turnstile success, hostname, and action within the server contract", async () => {
  let request: Request | undefined;
  const result = await verifyBrowserChallenge({
    token: "token",
    secret: "secret",
    expectedHostname: "refined-x.com",
    expectedAction: "public-ask",
    fetchImpl: async (input, init) => {
      request = new Request(input, init);
      return Response.json({ success: true, hostname: "refined-x.com", action: "public-ask" });
    },
  });
  assert.deepEqual(result, { ok: true });
  assert.equal(request?.url, "https://challenges.cloudflare.com/turnstile/v0/siteverify");
  const requestBody = await request!.text();
  assert.match(requestBody, /secret=secret/);
  assert.match(requestBody, /response=token/);
});

test("fails closed for hostname, action, expiry/replay, and verifier outages", async () => {
  const cases = [
    [{ success: true, hostname: "evil.example", action: "public-ask" }, "CHALLENGE_INVALID"],
    [{ success: true, hostname: "refined-x.com", action: "wrong" }, "CHALLENGE_INVALID"],
    [{ success: false, "error-codes": ["timeout-or-duplicate"] }, "CHALLENGE_EXPIRED"],
  ] as const;
  for (const [payload, code] of cases) {
    const result = await verifyBrowserChallenge({
      token: "token",
      secret: "secret",
      expectedHostname: "refined-x.com",
      expectedAction: "public-ask",
      fetchImpl: async () => Response.json(payload),
    });
    assert.deepEqual(result, { ok: false, code });
  }
  const outage = await verifyBrowserChallenge({
    token: "token",
    secret: "secret",
    expectedHostname: "refined-x.com",
    expectedAction: "public-ask",
    fetchImpl: async () => { throw new Error("offline"); },
  });
  assert.equal(outage.ok, false);
  if (!outage.ok) {
    assert.equal(outage.code, "CHALLENGE_UNAVAILABLE");
    assert.equal(outage.diagnostic?.errorType, "Error");
    assert.ok((outage.diagnostic?.elapsedMs ?? -1) >= 0);
  }
});

test("reports a non-2xx Siteverify status without exposing request credentials", async () => {
  const result = await verifyBrowserChallenge({
    token: "sensitive-token",
    secret: "sensitive-secret",
    expectedHostname: "refined-x.com",
    expectedAction: "public-ask",
    fetchImpl: async () => new Response("no", { status: 502 }),
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.diagnostic?.status, 502);
  assert.doesNotMatch(JSON.stringify(result), /sensitive/);
});

test("allows staging test responses to omit action when action validation is explicitly disabled", async () => {
  const result = await verifyBrowserChallenge({
    token: "dummy",
    secret: "dummy-secret",
    expectedHostname: "example.com",
    expectedAction: undefined,
    fetchImpl: async () => Response.json({ success: true, hostname: "example.com" }),
  });
  assert.deepEqual(result, { ok: true });
});
