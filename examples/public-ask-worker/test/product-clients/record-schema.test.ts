import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateProductClientRecord,
  validateSupportMatrix,
  type ProductClientRecord,
} from "./record-schema.ts";

const dir = dirname(fileURLToPath(import.meta.url));

test("not_run template matches plan §12.2 shape", () => {
  const record: ProductClientRecord = {
    client: "Cursor",
    clientVersion: null,
    platform: null,
    runtime: null,
    negotiation: null,
    observedProtocolVersion: null,
    toolDiscovery: "not_run",
    anonymousList: "not_run",
    authenticatedSummarize: "not_run",
    errorHandling: "not_run",
    testedAt: null,
    evidencePath: null,
    businessBackend: null,
  };
  assert.deepEqual(validateProductClientRecord(record), []);
});

test("passed gates require version, platform, evidence, and backend label", () => {
  const incomplete = {
    client: "Claude Code",
    clientVersion: null,
    platform: null,
    runtime: "v2",
    negotiation: "auto",
    observedProtocolVersion: "2026-07-28",
    toolDiscovery: "passed",
    anonymousList: "not_run",
    authenticatedSummarize: "not_run",
    errorHandling: "not_run",
    testedAt: null,
    evidencePath: null,
    businessBackend: null,
  };
  const errors = validateProductClientRecord(incomplete);
  assert.ok(errors.some((e) => e.includes("clientVersion")));
  assert.ok(errors.some((e) => e.includes("evidencePath")));
  assert.ok(errors.some((e) => e.includes("businessBackend")));
});

test("support matrix forbids marketing claims on extended not_run rows", () => {
  const errors = validateSupportMatrix({
    issue: "#16",
    updatedAt: "2026-09-09",
    offlineIntegration: {
      command: "npm run test:mcp-protocol",
      ciJob: "worker / MCP protocol integration",
      status: "passed",
    },
    rows: [
      {
        id: "cursor",
        client: "Cursor",
        path: "unknown",
        role: "extended",
        recordFile: "records/cursor.json",
        marketingClaimAllowed: true,
      },
    ],
  });
  assert.ok(errors.some((e) => e.includes("marketing")));
});

test("checked-in matrix and core records validate", () => {
  const matrix = JSON.parse(readFileSync(join(dir, "support-matrix.json"), "utf8"));
  assert.deepEqual(validateSupportMatrix(matrix), []);

  const coreIds = ["claude-code-modern", "codex-legacy"];
  for (const id of coreIds) {
    const row = matrix.rows.find((r: { id: string }) => r.id === id);
    assert.ok(row, `missing core row ${id}`);
    const record = JSON.parse(readFileSync(join(dir, row.recordFile), "utf8"));
    assert.deepEqual(validateProductClientRecord(record), [], id);
    for (const gate of [
      "toolDiscovery",
      "anonymousList",
      "authenticatedSummarize",
      "errorHandling",
    ] as const) {
      assert.equal(record[gate], "passed", `${id}.${gate}`);
    }
    assert.equal(row.marketingClaimAllowed, true, id);
  }

  for (const row of matrix.rows) {
    const record = JSON.parse(readFileSync(join(dir, row.recordFile), "utf8"));
    assert.deepEqual(validateProductClientRecord(record), [], row.id);
    if (row.role === "extended") {
      assert.equal(row.marketingClaimAllowed, false);
      for (const gate of [
        "toolDiscovery",
        "anonymousList",
        "authenticatedSummarize",
        "errorHandling",
      ] as const) {
        assert.equal(record[gate], "not_run", `${row.id}.${gate}`);
      }
      const notes = String(record.notes || "").toLowerCase();
      assert.equal(/\bverified support\b|\bsupported per\b|\balready verified\b/.test(notes), false, `${row.id} notes must not claim verified support`);
      assert.ok(notes.includes("not run") || notes.includes("not_run") || notes.includes("extended"), `${row.id} notes should mark extended/not_run`);
    }
  }
});
