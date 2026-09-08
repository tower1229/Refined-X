import { AsyncLocalStorage } from "node:async_hooks";
import {
  fromJsonSchema,
  McpServer,
  type McpRequestContext,
} from "@modelcontextprotocol/server";
import { CfWorkerJsonSchemaValidator } from "@modelcontextprotocol/server/validators/cf-worker";
import type { AskCallback, AskHttpOutcome, AskToolInput } from "./ask-tool.ts";

export const SPIKE_SERVER_INFO = {
  name: "public-ask-mcp-sdk-spike",
  version: "0.0.0-spike",
} as const;

export type SpikeStore = {
  ask: AskCallback;
  outcome: AskHttpOutcome;
};

export const spikeStore = new AsyncLocalStorage<SpikeStore>();

/** Chosen Worker-safe validator — exercised via fromJsonSchema under workerd HTTP. */
export const spikeJsonSchemaValidator = new CfWorkerJsonSchemaValidator();

const askInputSchema = fromJsonSchema<AskToolInput>(
  {
    type: "object",
    properties: {
      query: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description:
              "Trimmed length must be 1–500 Unicode code points (enforced after SDK schema).",
          },
        },
        required: ["text"],
        additionalProperties: false,
      },
      prefer: {
        type: "object",
        properties: {
          mode: {
            type: "string",
            description: "Comma-separated modes; MCP default is list.",
          },
        },
        additionalProperties: false,
      },
      auth: {
        type: "string",
        enum: ["ok", "unauthorized", "forbidden", "quota", "bad-output"],
      },
      delayMs: { type: "number", minimum: 0 },
      padBytes: { type: "number", minimum: 0 },
    },
    required: ["query"],
    additionalProperties: false,
  },
  spikeJsonSchemaValidator,
);

const askOutputSchema = fromJsonSchema<{
  ok: boolean;
  text: string;
  mode: string;
  pad?: string;
}>(
  {
    type: "object",
    properties: {
      ok: { type: "boolean" },
      text: { type: "string" },
      mode: { type: "string" },
      pad: { type: "string" },
    },
    required: ["ok", "text", "mode"],
    additionalProperties: false,
  },
  spikeJsonSchemaValidator,
);

/**
 * One factory, one ask tool — shared by modern and legacy legs of createMcpHandler.
 */
export function createSpikeAskServer(_ctx: McpRequestContext): McpServer {
  const store = spikeStore.getStore();
  if (!store) {
    throw new Error("spike ask factory invoked outside request store");
  }

  const server = new McpServer(SPIKE_SERVER_INFO, {
    jsonSchemaValidator: spikeJsonSchemaValidator,
  });

  server.registerTool(
    "ask",
    {
      title: "Ask",
      description:
        "Synthetic NLWeb-shaped ask for MCP SDK dual-era spike. No real model or retrieval.",
      inputSchema: askInputSchema,
      outputSchema: askOutputSchema,
      annotations: {
        readOnlyHint: true,
        openWorldHint: false,
      },
    },
    async (args, extra) => {
      const input = { ...(args as AskToolInput) };
      const authorization = extra.http?.req?.headers.get("authorization");
      if (input.auth === undefined && authorization) {
        if (authorization === "Bearer bad-key") input.auth = "unauthorized";
        else if (authorization === "Bearer no-summarize") input.auth = "forbidden";
        else if (authorization === "Bearer rate-limited") input.auth = "quota";
      }
      const mode = input.prefer?.mode ?? "";
      if (input.auth === undefined && !authorization && mode.includes("summarize")) {
        input.auth = "forbidden";
      }
      return store.ask(input, extra.http?.req?.signal, store.outcome);
    },
  );

  return server;
}
