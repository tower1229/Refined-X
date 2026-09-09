/**
 * Product-client acceptance record schema (plan §12.2 / issue #16).
 * Status values are closed: never rewrite not_run as passed without evidence.
 */

export const GATE_STATUSES = ["passed", "failed", "not_run"] as const;
export type GateStatus = (typeof GATE_STATUSES)[number];

export const CORE_GATES = [
  "toolDiscovery",
  "anonymousList",
  "authenticatedSummarize",
  "errorHandling",
] as const;
export type CoreGate = (typeof CORE_GATES)[number];

export type ProductClientRecord = {
  client: string;
  clientVersion: string | null;
  platform: string | null;
  runtime: string | null;
  negotiation: string | null;
  /** Observed wire protocol, e.g. 2026-07-28 or 2025-11-25. */
  observedProtocolVersion: string | null;
  toolDiscovery: GateStatus;
  anonymousList: GateStatus;
  authenticatedSummarize: GateStatus;
  errorHandling: GateStatus;
  /** ISO-8601 timestamp when the run finished, or null if not_run. */
  testedAt: string | null;
  /** Repo-relative path to evidence logs / transcripts. */
  evidencePath: string | null;
  /** Backend under test: synthetic mock vs staging/production. */
  businessBackend: "synthetic_mock" | "staging" | "production" | null;
  notes?: string;
  featureFlags?: Record<string, string | boolean | null>;
};

export type SupportMatrixRow = {
  id: string;
  client: string;
  path: "modern" | "legacy" | "unknown";
  role: "core" | "extended";
  recordFile: string;
  marketingClaimAllowed: boolean;
};

export type SupportMatrix = {
  issue: string;
  updatedAt: string;
  offlineIntegration: {
    command: string;
    ciJob: string;
    status: GateStatus;
  };
  rows: SupportMatrixRow[];
};

function isGateStatus(value: unknown): value is GateStatus {
  return typeof value === "string" && (GATE_STATUSES as readonly string[]).includes(value);
}

export function validateProductClientRecord(raw: unknown): string[] {
  const errors: string[] = [];
  if (!raw || typeof raw !== "object") {
    return ["record must be an object"];
  }
  const record = raw as Record<string, unknown>;

  if (typeof record.client !== "string" || record.client.trim() === "") {
    errors.push("client must be a non-empty string");
  }

  for (const key of [
    "clientVersion",
    "platform",
    "runtime",
    "negotiation",
    "observedProtocolVersion",
    "testedAt",
    "evidencePath",
  ] as const) {
    const value = record[key];
    if (value !== null && typeof value !== "string") {
      errors.push(`${key} must be string or null`);
    }
  }

  for (const gate of CORE_GATES) {
    if (!isGateStatus(record[gate])) {
      errors.push(`${gate} must be one of ${GATE_STATUSES.join("|")}`);
    }
  }

  const backend = record.businessBackend;
  if (
    backend !== null &&
    backend !== "synthetic_mock" &&
    backend !== "staging" &&
    backend !== "production"
  ) {
    errors.push("businessBackend must be synthetic_mock|staging|production|null");
  }

  const gates = CORE_GATES.map((g) => record[g] as GateStatus | undefined);
  const anyPassed = gates.some((g) => g === "passed");
  const anyFailed = gates.some((g) => g === "failed");
  if (anyPassed || anyFailed) {
    if (typeof record.clientVersion !== "string" || !record.clientVersion) {
      errors.push("clientVersion required when any gate is passed/failed");
    }
    if (typeof record.platform !== "string" || !record.platform) {
      errors.push("platform required when any gate is passed/failed");
    }
    if (typeof record.runtime !== "string" || !record.runtime) {
      errors.push("runtime required when any gate is passed/failed");
    }
    if (typeof record.negotiation !== "string" || !record.negotiation) {
      errors.push("negotiation required when any gate is passed/failed");
    }
    if (typeof record.observedProtocolVersion !== "string" || !record.observedProtocolVersion) {
      errors.push("observedProtocolVersion required when any gate is passed/failed");
    }
    if (typeof record.testedAt !== "string" || !record.testedAt) {
      errors.push("testedAt required when any gate is passed/failed");
    }
    if (typeof record.evidencePath !== "string" || !record.evidencePath) {
      errors.push("evidencePath required when any gate is passed/failed");
    }
    if (
      record.businessBackend !== "synthetic_mock" &&
      record.businessBackend !== "staging" &&
      record.businessBackend !== "production"
    ) {
      errors.push("businessBackend required when any gate is passed/failed");
    }
  }

  return errors;
}

export function validateSupportMatrix(raw: unknown): string[] {
  const errors: string[] = [];
  if (!raw || typeof raw !== "object") {
    return ["matrix must be an object"];
  }
  const matrix = raw as SupportMatrix;
  if (typeof matrix.issue !== "string" || !matrix.issue) {
    errors.push("issue required");
  }
  if (!matrix.offlineIntegration || !isGateStatus(matrix.offlineIntegration.status)) {
    errors.push("offlineIntegration.status invalid");
  }
  if (!Array.isArray(matrix.rows)) {
    errors.push("rows must be an array");
    return errors;
  }
  for (const row of matrix.rows) {
    if (!row || typeof row !== "object") {
      errors.push("row must be object");
      continue;
    }
    if (row.role === "extended" && row.marketingClaimAllowed) {
      errors.push(`${row.id}: extended rows must not allow marketing claims`);
    }
    if (row.role === "core" && typeof row.recordFile !== "string") {
      errors.push(`${row.id}: core rows need recordFile`);
    }
  }
  return errors;
}
