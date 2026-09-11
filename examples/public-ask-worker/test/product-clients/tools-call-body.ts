/**
 * Map MCP tools/call HTTP response body to acceptance fields.
 * Distinguishes final success, tool/RPC error, and incomplete (e.g. input_required).
 */

export type ToolsCallBodyInterpretation = {
  toolIsError: boolean | null;
  /** final = completed tool result; incomplete = needs more input; error = failed; null = unparsed */
  resultKind: "final" | "incomplete" | "error" | null;
  hasSearchSummary: boolean | null;
};

function hasSearchSummaryInResult(result: Record<string, unknown>): boolean | null {
  const structured = result.structuredContent;
  if (structured && typeof structured === "object") {
    const results = (structured as { results?: unknown }).results;
    if (Array.isArray(results)) {
      return results.some(
        (item) => item && typeof item === "object" && (item as { "@type"?: string })["@type"] === "SearchSummary",
      );
    }
  }
  const content = result.content;
  if (Array.isArray(content)) {
    for (const block of content) {
      if (!block || typeof block !== "object") continue;
      const text = (block as { text?: unknown }).text;
      if (typeof text !== "string") continue;
      try {
        const parsed = JSON.parse(text) as { results?: unknown };
        if (Array.isArray(parsed.results)) {
          return parsed.results.some(
            (item) =>
              item && typeof item === "object" && (item as { "@type"?: string })["@type"] === "SearchSummary",
          );
        }
      } catch {
        // plain text content
      }
    }
  }
  return false;
}

function interpretResultObject(result: Record<string, unknown>): ToolsCallBodyInterpretation {
  if (result.isError === true) {
    return { toolIsError: true, resultKind: "error", hasSearchSummary: null };
  }
  const resultType = result.resultType;
  if (resultType === "input_required" || resultType === "incomplete") {
    return { toolIsError: false, resultKind: "incomplete", hasSearchSummary: null };
  }
  if (typeof result.isError === "boolean" && result.isError === false) {
    return {
      toolIsError: false,
      resultKind: "final",
      hasSearchSummary: hasSearchSummaryInResult(result),
    };
  }
  // Successful MCP tool results often omit isError entirely.
  return {
    toolIsError: false,
    resultKind: "final",
    hasSearchSummary: hasSearchSummaryInResult(result),
  };
}

function tryObject(value: unknown): ToolsCallBodyInterpretation | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as { result?: unknown; error?: unknown };
  if (obj.error !== undefined) {
    return { toolIsError: true, resultKind: "error", hasSearchSummary: null };
  }
  if (obj.result && typeof obj.result === "object") {
    return interpretResultObject(obj.result as Record<string, unknown>);
  }
  return null;
}

/**
 * Parse ask tool arguments from a JSON-RPC tools/call request body.
 */
export function parseToolsCallRequest(rawBody: string): {
  jsonRpcMethod: string | null;
  toolName: string | null;
  askMode: "list" | "summarize" | null;
} {
  try {
    const parsed = JSON.parse(rawBody) as {
      method?: unknown;
      params?: { name?: unknown; arguments?: { prefer?: { mode?: unknown } } };
    };
    const jsonRpcMethod = typeof parsed.method === "string" ? parsed.method : null;
    if (jsonRpcMethod !== "tools/call") {
      return { jsonRpcMethod, toolName: null, askMode: null };
    }
    const toolName = typeof parsed.params?.name === "string" ? parsed.params.name : null;
    const modeRaw = parsed.params?.arguments?.prefer?.mode;
    let askMode: "list" | "summarize" | null = null;
    if (typeof modeRaw === "string") {
      const normalized = modeRaw
        .split(",")
        .map((part) => part.trim().toLowerCase())
        .filter(Boolean);
      if (normalized.includes("summarize") && !normalized.includes("list")) askMode = "summarize";
      else if (normalized.includes("list") && !normalized.includes("summarize")) askMode = "list";
      else if (normalized.length === 1 && (normalized[0] === "list" || normalized[0] === "summarize")) {
        askMode = normalized[0];
      } else if (normalized.includes("summarize")) {
        // list,summarize combo — treat as summarize intent for auth summarize gate
        askMode = "summarize";
      } else if (normalized.includes("list")) {
        askMode = "list";
      }
    }
    return { jsonRpcMethod, toolName, askMode };
  } catch {
    return { jsonRpcMethod: null, toolName: null, askMode: null };
  }
}

export function interpretToolsCallBody(
  text: string,
  contentType: string | null,
): ToolsCallBodyInterpretation {
  const empty: ToolsCallBodyInterpretation = {
    toolIsError: null,
    resultKind: null,
    hasSearchSummary: null,
  };
  const trimmed = text.trim();
  if (!trimmed) return empty;

  if ((contentType || "").includes("text/event-stream") || trimmed.startsWith("event:")) {
    if (/"isError"\s*:\s*true/.test(trimmed)) {
      return { toolIsError: true, resultKind: "error", hasSearchSummary: null };
    }
    if (/"resultType"\s*:\s*"input_required"/.test(trimmed)) {
      return { toolIsError: false, resultKind: "incomplete", hasSearchSummary: null };
    }
    for (const line of trimmed.split(/\r?\n/)) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const judged = tryObject(JSON.parse(payload) as unknown);
        if (judged) return judged;
      } catch {
        // Truncated or invalid JSON must stay unparsed — never keyword-guess success.
      }
    }
    return empty;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        const judged = tryObject(item);
        if (judged) return judged;
      }
      return empty;
    }
    return tryObject(parsed) ?? empty;
  } catch {
    return empty;
  }
}
