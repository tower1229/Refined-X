/**
 * Shared Public Ask contract for the site build and Public Ask Worker.
 * No env secrets, DB bindings, Astro modules, or Worker entry imports.
 */

export const NLWEB_VERSION = "0.55" as const;

export const QUERY_TEXT_MIN_CODE_POINTS = 1;
export const QUERY_TEXT_MAX_CODE_POINTS = 500;

export const SUPPORTED_ASK_MODES = ["list", "summarize"] as const;
export type AskMode = (typeof SUPPORTED_ASK_MODES)[number];

export type AskEntry = "http" | "mcp";

export const ASK_ENTRY_DEFAULT_MODE = {
  http: "list, summarize",
  mcp: "list",
} as const satisfies Record<AskEntry, string>;

export const PUBLIC_ASK_CAPABILITY =
  "NLWeb v0.55-compatible restricted /ask subset";

export const PUBLIC_ASK_SUPPORTED =
  "Supports POST /ask with conversational_search, list, summarize, buffered SSE, and MCP ask over Streamable HTTP.";

export const PUBLIC_ASK_UNSUPPORTED =
  "Does not support /await, promise responses, elicitation, chatgpt_app, arbitrary extension fields, result actions, or long-term memory.";

export const PUBLIC_ASK_SUPPORTED_ITEMS = [
  "POST /ask",
  "conversational_search",
  "list",
  "summarize",
  "SSE",
  "MCP ask",
] as const;

export const PUBLIC_ASK_UNSUPPORTED_ITEMS = [
  "/await",
  "promise responses",
  "elicitation",
  "chatgpt_app",
  "arbitrary extension fields",
  "result actions",
  "long-term memory",
] as const;

export type NlWebRequest = {
  query: {
    text: string;
  };
  prefer?: {
    streaming?: boolean;
    response_format?: string;
    mode?: string;
    "accept-language"?: string;
    "user-agent"?: string;
  };
  meta?: {
    version?: string;
  };
};

export type NlWebResult = {
  "@type": string;
  [key: string]: unknown;
};

export type NlWebMeta = {
  response_type: "answer" | "failure";
  response_format: "conversational_search";
  version: typeof NLWEB_VERSION;
  request_id: string;
  streaming?: boolean;
};

export type NlWebSuccessBody = {
  _meta: NlWebMeta;
  results: NlWebResult[];
};

/** Success result shape projection for OpenAPI / docs (runtime still builds Response in Worker). */
export const ASK_SUCCESS_RESULT_SCHEMA = {
  type: "object",
  required: ["_meta", "results"],
  properties: {
    _meta: {
      type: "object",
      required: ["response_type", "response_format", "version", "request_id"],
      properties: {
        response_type: { const: "answer" },
        response_format: { const: "conversational_search" },
        version: { const: NLWEB_VERSION },
        request_id: { type: "string" },
        streaming: { type: "boolean" },
      },
      additionalProperties: false,
    },
    results: {
      type: "array",
      items: {
        type: "object",
        required: ["@type"],
        properties: {
          "@type": { type: "string" },
        },
        additionalProperties: true,
      },
    },
  },
  additionalProperties: false,
} as const;

export class RequestProblem extends Error {
  readonly code: "INVALID_QUERY" | "UNSUPPORTED_FORMAT" | "UNSUPPORTED_MODE";

  constructor(
    code: "INVALID_QUERY" | "UNSUPPORTED_FORMAT" | "UNSUPPORTED_MODE",
    message: string,
  ) {
    super(message);
    this.code = code;
  }
}

/** Raw JSON Schema projection for MCP tools/list and OpenAPI (constraints enforced by normalize). */
export const ASK_RAW_INPUT_SCHEMA = {
  type: "object",
  description: `${PUBLIC_ASK_CAPABILITY}. ${PUBLIC_ASK_SUPPORTED} ${PUBLIC_ASK_UNSUPPORTED}`,
  properties: {
    query: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description:
            "Question text. After trim, must contain 1–500 Unicode code points (not UTF-16 length).",
        },
      },
      required: ["text"],
      additionalProperties: false,
    },
    prefer: {
      type: "object",
      properties: {
        streaming: { type: "boolean" },
        mode: {
          type: "string",
          description:
            "Comma-separated modes: list, summarize. Entry defaults: HTTP Ask uses list, summarize; MCP Ask uses list (including empty string).",
          examples: ["list", "summarize", "list, summarize"],
        },
        response_format: { const: "conversational_search" },
        "accept-language": { type: "string" },
        "user-agent": { type: "string" },
      },
      additionalProperties: false,
    },
    context: { type: "object", maxProperties: 0, additionalProperties: false },
    meta: {
      type: "object",
      properties: {
        version: { const: NLWEB_VERSION },
      },
      additionalProperties: false,
    },
  },
  required: ["query"],
  additionalProperties: false,
} as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rejectUnknownFields(value: Record<string, unknown>, allowed: readonly string[], path = "") {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(value).find((key) => !allowedSet.has(key));
  if (unknown) {
    throw new RequestProblem("INVALID_QUERY", `unsupported field: ${path}${unknown}`);
  }
}

function parseModeTokens(mode: string): string[] {
  return mode
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * Resolve the effective mode string for an entry.
 * HTTP: only missing mode gets list, summarize; empty / whitespace / commas stay as-is for the parser.
 * MCP: missing or "" prefer.mode gets list; whitespace / commas stay as-is.
 */
export function resolveEntryMode(mode: string | undefined, entry: AskEntry): string | undefined {
  if (entry === "mcp") {
    if (mode === undefined || mode === "") return ASK_ENTRY_DEFAULT_MODE.mcp;
    return mode;
  }
  if (mode === undefined) return ASK_ENTRY_DEFAULT_MODE.http;
  return mode;
}

export function responseModes(mode: string | undefined, entry: AskEntry = "http"): string[] {
  const resolved = resolveEntryMode(mode, entry);
  if (resolved === undefined) return [];
  return parseModeTokens(resolved);
}

/**
 * Apply entry-default mode policy onto a shallow copy of the raw body.
 * Illegal prefer types are left untouched for normalize to reject.
 * MCP only defaults when prefer is absent, or prefer is an object with mode missing/"".
 */
export function applyEntryModePolicy(value: unknown, entry: AskEntry): unknown {
  if (!isObject(value)) return value;
  const next: Record<string, unknown> = { ...value };

  if (entry === "mcp") {
    if (next.prefer === undefined) {
      next.prefer = { mode: ASK_ENTRY_DEFAULT_MODE.mcp };
    } else if (isObject(next.prefer)) {
      const prefer = { ...next.prefer };
      if (prefer.mode === undefined || prefer.mode === "") {
        prefer.mode = ASK_ENTRY_DEFAULT_MODE.mcp;
      }
      next.prefer = prefer;
    }
    return next;
  }

  // HTTP keeps raw prefer untouched; default is applied via responseModes(undefined, "http").
  return next;
}

export function normalizeAskRequest(value: unknown, entry: AskEntry = "http"): NlWebRequest {
  const prepared = applyEntryModePolicy(value, entry);
  if (!isObject(prepared) || !isObject(prepared.query)) {
    throw new RequestProblem("INVALID_QUERY", "query must be an object");
  }
  rejectUnknownFields(prepared, ["query", "context", "prefer", "meta"]);
  rejectUnknownFields(prepared.query, ["text"], "query.");
  const text = prepared.query.text;
  if (typeof text !== "string" || text.trim().length === 0 || [...text.trim()].length > QUERY_TEXT_MAX_CODE_POINTS) {
    throw new RequestProblem("INVALID_QUERY", "query.text must contain 1 to 500 Unicode code points");
  }
  if (prepared.context !== undefined && !isObject(prepared.context)) {
    throw new RequestProblem("INVALID_QUERY", "context must be an object");
  }
  if (isObject(prepared.context)) rejectUnknownFields(prepared.context, [], "context.");
  if (prepared.prefer !== undefined && !isObject(prepared.prefer)) {
    throw new RequestProblem("INVALID_QUERY", "prefer must be an object");
  }
  if (prepared.meta !== undefined && !isObject(prepared.meta)) {
    throw new RequestProblem("INVALID_QUERY", "meta must be an object");
  }

  const prefer = prepared.prefer as NlWebRequest["prefer"];
  const meta = prepared.meta as NlWebRequest["meta"];
  if (isObject(prefer)) {
    rejectUnknownFields(
      prefer,
      ["streaming", "response_format", "mode", "accept-language", "user-agent"],
      "prefer.",
    );
  }
  if (isObject(meta)) rejectUnknownFields(meta, ["version"], "meta.");
  if (prefer?.streaming !== undefined && typeof prefer.streaming !== "boolean") {
    throw new RequestProblem("INVALID_QUERY", "prefer.streaming must be a boolean");
  }
  for (const field of ["accept-language", "user-agent"] as const) {
    if (prefer?.[field] !== undefined && typeof prefer[field] !== "string") {
      throw new RequestProblem("INVALID_QUERY", `prefer.${field} must be a string`);
    }
  }
  if (prefer?.mode !== undefined && typeof prefer.mode !== "string") {
    throw new RequestProblem("INVALID_QUERY", "prefer.mode must be a string");
  }
  if (prefer?.response_format !== undefined && typeof prefer.response_format !== "string") {
    throw new RequestProblem("INVALID_QUERY", "prefer.response_format must be a string");
  }
  if (meta?.version !== undefined && typeof meta.version !== "string") {
    throw new RequestProblem("INVALID_QUERY", "meta.version must be a string");
  }
  if (meta?.version !== undefined && meta.version !== NLWEB_VERSION) {
    throw new RequestProblem("INVALID_QUERY", `only NLWeb ${NLWEB_VERSION} is supported`);
  }
  if (
    prefer?.response_format !== undefined &&
    prefer.response_format !== "conversational_search"
  ) {
    throw new RequestProblem("UNSUPPORTED_FORMAT", "only conversational_search is supported");
  }

  // Mode tokens for validation: after MCP policy, missing/"" already became "list".
  // HTTP still uses responseModes so undefined → list, summarize for the check only.
  const modes = responseModes(prefer?.mode, entry);
  if (modes.some((mode) => mode !== "list" && mode !== "summarize")) {
    throw new RequestProblem("UNSUPPORTED_MODE", "supported modes are list and summarize");
  }

  return {
    query: { text: text.trim() },
    ...(prefer === undefined ? {} : { prefer }),
    ...(meta === undefined ? {} : { meta }),
  };
}

/** @deprecated Prefer normalizeAskRequest(value, "http") — kept for call-site clarity. */
export function parseNlWebRequest(value: unknown): NlWebRequest {
  return normalizeAskRequest(value, "http");
}
