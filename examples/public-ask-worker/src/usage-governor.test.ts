import assert from "node:assert/strict";
import test from "node:test";
import {
  commitGeneration,
  releaseGeneration,
  releaseKeyRequest,
  reserveGeneration,
  reserveKeyRequest,
  reserveRequest,
  retryAfterNextUtcDay,
} from "./usage-governor.ts";

function databaseReturning(rows: Array<object | null>) {
  const statements: string[] = [];
  const bindings: unknown[][] = [];
  return {
    statements,
    bindings,
    db: {
      prepare(sql: string) {
        statements.push(sql);
        return {
          bind(...values: unknown[]) {
            bindings.push(values);
            return { async first() { return rows.shift() ?? null; }, async run() { return {}; } };
          },
        };
      },
    } as unknown as D1Database,
  };
}

test("atomically reserves accepted requests and shared generations on the UTC day", async () => {
  const fake = databaseReturning([{ accepted_requests: 1 }, { generation_reserved: 1 }]);
  const now = new Date("2026-07-03T23:59:59.000Z");
  assert.equal(await reserveRequest(fake.db, 1000, now), true);
  assert.equal(await reserveGeneration(fake.db, 200, now), true);
  assert.match(fake.statements[0], /accepted_requests < \?3/);
  assert.match(fake.statements[1], /generation_committed \+ generation_reserved < \?3/);
  assert.equal(fake.bindings[0][0], "2026-07-03");
  assert.equal(fake.bindings[1][0], "2026-07-03");
});

test("returns false at the atomic limit and commits or releases a reservation", async () => {
  const fake = databaseReturning([null, null]);
  const now = new Date("2026-07-03T12:00:00.000Z");
  assert.equal(await reserveRequest(fake.db, 1000, now), false);
  assert.equal(await reserveGeneration(fake.db, 200, now), false);
  await commitGeneration(fake.db, now);
  await releaseGeneration(fake.db, now);
  assert.match(fake.statements[2], /generation_committed = generation_committed \+ 1/);
  assert.match(fake.statements[3], /generation_reserved = generation_reserved - 1/);
});

test("computes Retry-After to the next UTC day", () => {
  assert.equal(retryAfterNextUtcDay(new Date("2026-07-03T23:59:50.250Z")), 10);
  assert.equal(retryAfterNextUtcDay(new Date("2026-07-03T00:00:00.000Z")), 86_400);
});

test("reserves and releases a trusted key daily request independently", async () => {
  const fake = databaseReturning([{ accepted_requests: 1 }]);
  const now = new Date("2026-07-03T12:00:00.000Z");
  assert.equal(await reserveKeyRequest(fake.db, "abcdefghijklmnop", 25, now), true);
  await releaseKeyRequest(fake.db, "abcdefghijklmnop", now);
  assert.match(fake.statements[0], /public_ask_key_usage/);
  assert.match(fake.statements[0], /accepted_requests < \?4/);
  assert.match(fake.statements[1], /accepted_requests = accepted_requests - 1/);
});
