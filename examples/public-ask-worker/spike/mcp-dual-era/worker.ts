import { createCountingAskCallback } from "./ask-tool.ts";
import { createSpikeMcpFetch } from "./http-boundary.ts";

/**
 * Isolated synthetic Worker entry for batch-0 dual-era MCP SDK spike.
 * Not wired into production public-ask routes.
 */
const askCounter = { value: 0 };
const ask = createCountingAskCallback(askCounter);
const mcpFetch = createSpikeMcpFetch({ ask });

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return Response.json({ ok: true, askCalls: askCounter.value });
    }
    if (url.pathname === "/mcp") {
      return mcpFetch(request);
    }
    return new Response("Not found", { status: 404 });
  },
};

export { askCounter };
