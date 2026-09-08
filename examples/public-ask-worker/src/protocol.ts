export {
  NLWEB_VERSION,
  RequestProblem,
  normalizeAskRequest,
  parseNlWebRequest,
  responseModes,
  type NlWebMeta,
  type NlWebRequest,
  type NlWebResult,
  type NlWebSuccessBody,
  type AskEntry,
} from "../../../shared/public-ask-contract.ts";

import {
  NLWEB_VERSION,
  type NlWebMeta,
  type NlWebResult,
} from "../../../shared/public-ask-contract.ts";

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
