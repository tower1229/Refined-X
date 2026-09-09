import { normalizeAskRequest, RequestProblem, type NlWebRequest } from "./protocol.ts";

export const MAX_REQUEST_BYTES = 16 * 1024;

export class RequestEnvelopeProblem extends Error {
  readonly code = "INVALID_QUERY";
}

export class JsonBodyProblem extends Error {
  readonly reason: "missing_body" | "body_too_large" | "invalid_json";

  constructor(reason: "missing_body" | "body_too_large" | "invalid_json") {
    super(reason);
    this.reason = reason;
  }
}

/**
 * Stream-read a request body up to maxBytes. Cancels the reader as soon as the
 * limit is exceeded so oversized payloads are not fully buffered.
 */
export async function readBoundedBodyBytes(
  request: Request,
  maxBytes = MAX_REQUEST_BYTES,
): Promise<Uint8Array> {
  if (!request.body) throw new JsonBodyProblem("missing_body");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel("body_too_large");
        throw new JsonBodyProblem("body_too_large");
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof JsonBodyProblem) throw error;
    throw new JsonBodyProblem("invalid_json");
  }
  const out = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export async function readJsonBody(
  request: Request,
  maxBytes = MAX_REQUEST_BYTES,
): Promise<unknown> {
  const raw = await readBoundedBodyBytes(request, maxBytes);
  try {
    return JSON.parse(new TextDecoder().decode(raw));
  } catch (error) {
    if (error instanceof JsonBodyProblem) throw error;
    throw new JsonBodyProblem("invalid_json");
  }
}

export async function readRequestEnvelope(
  request: Request,
  maxBytes = MAX_REQUEST_BYTES,
): Promise<NlWebRequest> {
  if (!request.body) throw new RequestEnvelopeProblem("request body is required");
  let raw: Uint8Array;
  try {
    raw = await readBoundedBodyBytes(request, maxBytes);
  } catch (error) {
    if (error instanceof JsonBodyProblem && error.reason === "body_too_large") {
      throw new RequestEnvelopeProblem("request body must not exceed 16 KiB");
    }
    if (error instanceof JsonBodyProblem && error.reason === "missing_body") {
      throw new RequestEnvelopeProblem("request body is required");
    }
    throw new RequestEnvelopeProblem("request body must be valid JSON");
  }
  try {
    return normalizeAskRequest(JSON.parse(new TextDecoder().decode(raw)), "http");
  } catch (error) {
    if (error instanceof RequestProblem) throw error;
    throw new RequestEnvelopeProblem("request body must be valid JSON");
  }
}
