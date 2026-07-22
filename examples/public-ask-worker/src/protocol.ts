export const NLWEB_VERSION = "0.55";

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

export function parseNlWebRequest(value: unknown): NlWebRequest {
  if (!isObject(value) || !isObject(value.query)) {
    throw new RequestProblem("INVALID_QUERY", "query must be an object");
  }
  rejectUnknownFields(value, ["query", "context", "prefer", "meta"]);
  rejectUnknownFields(value.query, ["text"], "query.");
  const text = value.query.text;
  if (typeof text !== "string" || text.trim().length === 0 || [...text.trim()].length > 500) {
    throw new RequestProblem("INVALID_QUERY", "query.text must contain 1 to 500 characters");
  }
  if (value.context !== undefined && !isObject(value.context)) {
    throw new RequestProblem("INVALID_QUERY", "context must be an object");
  }
  if (isObject(value.context)) rejectUnknownFields(value.context, [], "context.");
  if (value.prefer !== undefined && !isObject(value.prefer)) {
    throw new RequestProblem("INVALID_QUERY", "prefer must be an object");
  }
  if (value.meta !== undefined && !isObject(value.meta)) {
    throw new RequestProblem("INVALID_QUERY", "meta must be an object");
  }

  const prefer = value.prefer as NlWebRequest["prefer"];
  const meta = value.meta as NlWebRequest["meta"];
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
  const modes = responseModes(prefer?.mode);
  if (modes.some((mode) => mode !== "list" && mode !== "summarize")) {
    throw new RequestProblem("UNSUPPORTED_MODE", "supported modes are list and summarize");
  }

  return {
    query: { text: text.trim() },
    ...(prefer === undefined ? {} : { prefer }),
    ...(meta === undefined ? {} : { meta }),
  };
}

export function responseModes(mode: string | undefined): string[] {
  return (mode ?? "list, summarize")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function answerMeta(requestId: string, streaming = false): NlWebMeta {
  return {
    response_type: "answer",
    response_format: "conversational_search",
    version: NLWEB_VERSION,
    request_id: requestId,
    ...(streaming ? { streaming: true } : {}),
  };
}

export function failureResponse(
  requestId: string,
  code: string,
  message: string,
  status: number,
  headers: HeadersInit = {},
  retryAfter?: number,
  detail?: Record<string, unknown>,
): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("x-request-id", requestId);
  if (retryAfter !== undefined) {
    responseHeaders.set("retry-after", String(retryAfter));
  }
  return Response.json(
    {
      _meta: {
        response_type: "failure",
        response_format: "conversational_search",
        version: NLWEB_VERSION,
        request_id: requestId,
      },
      error: { code, message, ...(detail === undefined ? {} : { detail }) },
    },
    { status, headers: responseHeaders },
  );
}

export function streamResponse(requestId: string, results: NlWebResult[], headers: HeadersInit = {}) {
  const encoder = new TextEncoder();
  const lines = streamLines(requestId, results);
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(line));
      controller.close();
    },
  });
  const responseHeaders = new Headers(headers);
  responseHeaders.set("content-type", "text/event-stream; charset=utf-8");
  responseHeaders.set("cache-control", "no-store");
  responseHeaders.set("x-accel-buffering", "no");
  responseHeaders.set("x-request-id", requestId);
  return new Response(body, { headers: responseHeaders });
}

function streamLines(requestId: string, results: NlWebResult[]) {
  const meta = answerMeta(requestId, true);
  return [
    `event: start\ndata: ${JSON.stringify({ _meta: meta })}\n\n`,
    ...results.map(
      (item, index) => `event: result\ndata: ${JSON.stringify({ index, item })}\n\n`,
    ),
    `event: complete\ndata: ${JSON.stringify({ _meta: answerMeta(requestId) })}\n\n`,
  ];
}

export function fitResponseResults(requestId: string, results: NlWebResult[], maxBytes = 128 * 1024) {
  const encoder = new TextEncoder();
  const fitted = structuredClone(results);
  const size = () => Math.max(
    encoder.encode(JSON.stringify({ _meta: answerMeta(requestId), results: fitted })).byteLength,
    encoder.encode(streamLines(requestId, fitted).join("")).byteLength,
  );
  const descriptions = fitted.filter((result) => typeof result.description === "string" && result.description);
  const originals = descriptions.map((result) => String(result.description));
  for (const result of descriptions) result.description = "";
  const baseSize = size();
  if (baseSize > maxBytes) throw new Error("response_payload_too_large");
  const descriptionBudget = descriptions.length > 0
    ? Math.floor((maxBytes - baseSize) * 0.9 / descriptions.length)
    : 0;
  const truncateUtf8 = (value: string, byteLimit: number) => {
    const bytes = encoder.encode(value);
    if (bytes.byteLength <= byteLimit) return value;
    const decoder = new TextDecoder("utf-8", { fatal: true });
    for (let end = byteLimit; end >= Math.max(0, byteLimit - 4); end -= 1) {
      try {
        return decoder.decode(bytes.slice(0, end));
      } catch {
        // Try before the split UTF-8 code point.
      }
    }
    return "";
  };
  descriptions.forEach((result, index) => {
    result.description = truncateUtf8(originals[index], descriptionBudget);
  });
  while (size() > maxBytes) {
    const candidates = descriptions.filter((result) => result.description);
    if (candidates.length === 0) throw new Error("response_payload_too_large");
    for (const result of candidates) {
      const current = String(result.description);
      result.description = truncateUtf8(current, Math.floor(encoder.encode(current).byteLength * 0.8));
    }
  }
  return fitted;
}
