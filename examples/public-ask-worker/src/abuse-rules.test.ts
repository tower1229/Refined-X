import assert from "node:assert/strict";
import test from "node:test";
import {
  abusePolicy,
  blockDecision,
  classifyRequestViolation,
  recordExplicitViolation,
  type AbuseReasonCode,
} from "./abuse-rules.ts";

test("defines the fifth explicit violation in ten minutes as a reversible fifteen-minute block", () => {
  assert.deepEqual(abusePolicy, {
    windowMs: 10 * 60 * 1000,
    threshold: 5,
    blockMs: 15 * 60 * 1000,
  });
  assert.equal(blockDecision(null, 1_000), null);
  assert.equal(blockDecision(1_000, 1_000), null);
  assert.deepEqual(blockDecision(16_001, 1_000), { blockedUntil: 16_001, retryAfter: 16 });
});

test("uses a first-primary D1 session for write-then-read block decisions", async () => {
  let sessionMode = "";
  const statements: string[] = [];
  const session = {
    prepare(sql: string) {
      statements.push(sql);
      return {
        bind() { return this; },
        async run() {},
        async first() { return { blocked_until: 901_000 }; },
      };
    },
  };
  const db = {
    withSession(mode: string) { sessionMode = mode; return session; },
  } as unknown as D1Database;

  assert.deepEqual(
    await recordExplicitViolation(db, { type: "actor", id: "actor" }, "request", "JSON_MALFORMED", 1_000),
    { blockedUntil: 901_000, retryAfter: 900 },
  );
  assert.equal(sessionMode, "first-primary");
  assert.equal(statements.length, 2);
});

test("maps only explicit protocol and access violations to stable reason codes", () => {
  const cases: Array<[Parameters<typeof classifyRequestViolation>[0], AbuseReasonCode | null]> = [
    [{ kind: "envelope", message: "request body must not exceed 16 KiB" }, "BODY_TOO_LARGE"],
    [{ kind: "envelope", message: "request body must be valid JSON" }, "JSON_MALFORMED"],
    [{ kind: "request", code: "INVALID_QUERY", message: "unsupported field: meta.remember" }, "UNSUPPORTED_FIELD"],
    [{ kind: "request", code: "UNSUPPORTED_MODE", message: "unsupported" }, "UNSUPPORTED_MODE"],
    [{ kind: "challenge", code: "CHALLENGE_INVALID" }, "CHALLENGE_INVALID"],
    [{ kind: "challenge", code: "CHALLENGE_UNAVAILABLE" }, null],
    [{ kind: "api_key", reason: "invalid" }, "API_KEY_INVALID"],
    [{ kind: "api_key", reason: "revoked" }, "API_KEY_REVOKED"],
  ];
  for (const [input, expected] of cases) assert.equal(classifyRequestViolation(input), expected);
});
