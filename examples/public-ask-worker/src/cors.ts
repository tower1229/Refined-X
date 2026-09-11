/** Shared CORS allow-headers for Ask + MCP browser preflight. */
export const PUBLIC_ASK_CORS_ALLOW_HEADERS = [
  "content-type",
  "authorization",
  "accept",
  "mcp-protocol-version",
  "mcp-method",
  "mcp-name",
  "cf-turnstile-response",
].join(", ");

export const PUBLIC_ASK_CORS_EXPOSE_HEADERS = "retry-after, www-authenticate, x-request-id";
