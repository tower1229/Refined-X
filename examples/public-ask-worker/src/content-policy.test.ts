import assert from "node:assert/strict";
import test from "node:test";
import { redactCredentials, redactValue } from "./content-policy.ts";

test("deterministically redacts high-confidence credentials but leaves ordinary PII alone", () => {
  const input = [
    "Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature",
    "api_key=sk-abcdefghijklmnopqrstuvwxyz123456",
    "password: hunter2",
    '"password":"json-secret"',
    "-----BEGIN PRIVATE KEY-----\nsecret-material\n-----END PRIVATE KEY-----",
    "email owner@example.com phone 13800138000",
  ].join("\n");
  const result = redactCredentials(input);
  assert.deepEqual(result.categories, ["api_key", "bearer_token", "password", "private_key"]);
  assert.doesNotMatch(result.text, /eyJhbGci|abcdefghijklmnopqrstuvwxyz|hunter2|json-secret|secret-material/);
  assert.match(result.text, /owner@example\.com/);
  assert.match(result.text, /13800138000/);
});

test("redacts quoted credential fields including values with spaces", () => {
  const input = `{"password":"correct horse battery staple","api_key":"custom credential value"}`;
  const result = redactCredentials(input);

  assert.deepEqual(result.categories, ["api_key", "password"]);
  assert.equal(result.text.includes("correct horse battery staple"), false);
  assert.equal(result.text.includes("custom credential value"), false);
});

test("redacts nested response and persistence values with the same rules", () => {
  const value = {
    answer: "use Bearer abcdefghijklmnopqrstuvwxyz",
    results: [{ description: "password=secret-value", apiKey: "opaque custom secret" }],
  };
  const result = redactValue(value);
  assert.doesNotMatch(JSON.stringify(result.value), /abcdefghijklmnopqrstuvwxyz|secret-value|opaque custom secret/);
  assert.deepEqual(result.categories, ["api_key", "bearer_token", "password"]);
});
