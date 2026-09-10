/**
 * Map MCP tools/call HTTP body text to tool result isError.
 * Successful results often omit `isError` entirely (treat as false).
 */
export function interpretToolsCallBody(text: string, contentType: string | null): boolean | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const tryObject = (value: unknown): boolean | null => {
    if (!value || typeof value !== "object") return null;
    const obj = value as { result?: { isError?: unknown }; error?: unknown };
    if (obj.error !== undefined) return true;
    if (obj.result && typeof obj.result === "object") {
      if (typeof (obj.result as { isError?: unknown }).isError === "boolean") {
        return (obj.result as { isError: boolean }).isError;
      }
      return false;
    }
    return null;
  };

  if ((contentType || "").includes("text/event-stream") || trimmed.startsWith("event:")) {
    if (/"isError"\s*:\s*true/.test(trimmed)) return true;
    for (const line of trimmed.split(/\r?\n/)) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const judged = tryObject(JSON.parse(payload) as unknown);
        if (judged !== null) return judged;
      } catch {
        // continue scanning
      }
    }
    if (/"error"\s*:/.test(trimmed) && !/"result"\s*:/.test(trimmed)) return true;
    if (/"result"\s*:/.test(trimmed)) return false;
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        const judged = tryObject(item);
        if (judged !== null) return judged;
      }
      return null;
    }
    return tryObject(parsed);
  } catch {
    return null;
  }
}
