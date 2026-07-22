import { parseNlWebRequest, RequestProblem, type NlWebRequest } from "./protocol.ts";

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

export async function readJsonBody(
  request: Request,
  maxBytes = MAX_REQUEST_BYTES,
): Promise<unknown> {
  if (!request.body) throw new JsonBodyProblem("missing_body");
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel("body_too_large");
        throw new JsonBodyProblem("body_too_large");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text);
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
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel("body_too_large");
        throw new RequestEnvelopeProblem("request body must not exceed 16 KiB");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return parseNlWebRequest(JSON.parse(text));
  } catch (error) {
    if (error instanceof RequestEnvelopeProblem || error instanceof RequestProblem) throw error;
    throw new RequestEnvelopeProblem("request body must be valid JSON");
  }
}
