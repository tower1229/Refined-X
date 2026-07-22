import assert from "node:assert/strict";
import test from "node:test";
import {
  authenticateMachineCredential,
  createApiKeyCredential,
  digestApiKeySecret,
} from "./api-keys.ts";

test("creates a high-entropy key_id + secret credential and stores only its digest", async () => {
  const credential = createApiKeyCredential((length) => new Uint8Array(length).fill(7));
  assert.match(credential.plaintext, /^pask_[A-Za-z0-9_-]{16}_[A-Za-z0-9_-]{43}$/);
  assert.equal(credential.secret.length, 43);
  const digest = await digestApiKeySecret(credential.secret);
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(digest, new RegExp(credential.secret));
});

test("authenticates an active key while retaining precise internal failure reasons", async () => {
  const keyId = "abcdefghijklmnop";
  const secret = "A".repeat(43);
  const digest = await digestApiKeySecret(secret);
  const row = {
    key_id: keyId,
    secret_digest: digest,
    name: "integration",
    status: "active",
    allowed_modes: '["list","summarize"]',
    daily_limit: 200,
  };
  const db = {
    prepare() {
      return { bind() { return { async first() { return row; } }; } };
    },
  } as unknown as D1Database;
  const result = await authenticateMachineCredential(db, `Bearer pask_${keyId}_${secret}`);
  assert.deepEqual(result, {
    ok: true,
    key: { keyId, name: "integration", allowedModes: ["list", "summarize"], dailyLimit: 200 },
  });

  const invalid = await authenticateMachineCredential(db, `Bearer pask_${keyId}_${"B".repeat(43)}`);
  assert.deepEqual(invalid, { ok: false, reason: "invalid" });
  row.status = "revoked";
  const revoked = await authenticateMachineCredential(db, `Bearer pask_${keyId}_${secret}`);
  assert.deepEqual(revoked, { ok: false, reason: "revoked", keyId });
});

test("does not query D1 for missing or malformed credentials", async () => {
  let queries = 0;
  const db = { prepare() { queries += 1; throw new Error("unexpected query"); } } as unknown as D1Database;
  assert.deepEqual(await authenticateMachineCredential(db, null), { ok: false, reason: "missing" });
  assert.deepEqual(await authenticateMachineCredential(db, "Bearer not-a-public-ask-key"), { ok: false, reason: "invalid" });
  assert.equal(queries, 0);
});
