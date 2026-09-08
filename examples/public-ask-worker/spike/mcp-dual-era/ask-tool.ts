/**
 * Synthetic ask callback for batch-0 SDK spike.
 * No production routes, models, retrieval, or durable state.
 */

export type AskAuthCase = "ok" | "unauthorized" | "forbidden" | "quota" | "bad-output";

export type AskToolInput = {
  query: { text: string };
  prefer?: { mode?: string };
  /** Spike-only switch to exercise HTTP status mapping without real keys. */
  auth?: AskAuthCase;
  /** Spike-only: delay before returning, for cancel/timeout coverage. */
  delayMs?: number;
  /** Spike-only: inflate successful payload toward the response bound. */
  padBytes?: number;
};

export type AskHttpOutcome = {
  status: number;
  retryAfter?: number;
};

export type AskToolResult = {
  isError?: boolean;
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
};

export type AskCallback = (
  input: AskToolInput,
  signal: AbortSignal | undefined,
  outcome: AskHttpOutcome,
) => Promise<AskToolResult>;

const MAX_QUERY_CODE_POINTS = 500;

function codePointLength(value: string): number {
  return [...value].length;
}

/**
 * MCP entry defaults: missing / empty mode → list (not HTTP Ask's list+summarize).
 * Boundary checks mirror plan §7.1 without importing production protocol.ts.
 */
export function normalizeSpikeAskInput(raw: AskToolInput): {
  ok: true;
  text: string;
  mode: string;
  auth: AskAuthCase;
  delayMs: number;
  padBytes: number;
} | {
  ok: false;
  result: AskToolResult;
} {
  if (typeof raw.query?.text !== "string") {
    return {
      ok: false,
      result: toolError("INVALID_QUERY", "query.text must be a string"),
    };
  }
  const text = raw.query.text.trim();
  if (text.length === 0 || codePointLength(text) > MAX_QUERY_CODE_POINTS) {
    return {
      ok: false,
      result: toolError("INVALID_QUERY", "query.text must contain 1 to 500 characters"),
    };
  }

  let mode: string;
  if (raw.prefer?.mode === undefined || raw.prefer.mode === "") {
    mode = "list";
  } else if (typeof raw.prefer.mode !== "string") {
    return {
      ok: false,
      result: toolError("INVALID_QUERY", "prefer.mode must be a string"),
    };
  } else {
    const modes = raw.prefer.mode
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    if (modes.length === 0) {
      mode = "list";
    } else if (modes.some((part) => part !== "list" && part !== "summarize")) {
      return {
        ok: false,
        result: toolError("UNSUPPORTED_MODE", "supported modes are list and summarize"),
      };
    } else {
      mode = modes.join(", ");
    }
  }

  const auth = raw.auth ?? "ok";
  const delayMs = typeof raw.delayMs === "number" && raw.delayMs > 0 ? raw.delayMs : 0;
  const padBytes = typeof raw.padBytes === "number" && raw.padBytes > 0 ? raw.padBytes : 0;

  return { ok: true, text, mode, auth, delayMs, padBytes };
}

export function toolError(code: string, message: string): AskToolResult {
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify({ error: { code, message } }) }],
  };
}

export function createCountingAskCallback(counter: { value: number }): AskCallback {
  return async (input, signal, outcome) => {
    counter.value += 1;

    const normalized = normalizeSpikeAskInput(input);
    if (!normalized.ok) {
      outcome.status = 200;
      return normalized.result;
    }

    if (normalized.auth === "unauthorized") {
      outcome.status = 401;
      return toolError("UNAUTHORIZED", "invalid key");
    }
    if (normalized.auth === "forbidden") {
      outcome.status = 403;
      return toolError("FORBIDDEN", "summarize not permitted");
    }
    if (normalized.auth === "quota") {
      outcome.status = 429;
      outcome.retryAfter = 30;
      return toolError("RATE_LIMITED", "quota exceeded");
    }
    if (normalized.auth === "bad-output") {
      outcome.status = 200;
      return {
        content: [{ type: "text", text: "{\"ok\":false}" }],
        // Intentionally invalid against askOutputSchema to exercise CfWorkerJsonSchemaValidator.
        structuredContent: { ok: "not-a-boolean", text: normalized.text, mode: normalized.mode },
      };
    }

    if (normalized.delayMs > 0) {
      try {
        await sleep(normalized.delayMs, signal);
      } catch {
        outcome.status = 200;
        return toolError("ABORTED", "request cancelled");
      }
    }
    if (signal?.aborted) {
      outcome.status = 200;
      return toolError("ABORTED", "request cancelled");
    }

    const structured: Record<string, unknown> = {
      ok: true,
      text: normalized.text,
      mode: normalized.mode,
    };
    if (normalized.padBytes > 0) {
      structured.pad = "p".repeat(normalized.padBytes);
    }

    outcome.status = 200;
    return {
      content: [{ type: "text", text: JSON.stringify(structured) }],
      structuredContent: structured,
    };
  };
}

function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error("aborted"));
      return;
    }
    const timer = setTimeout(() => resolve(), ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason ?? new Error("aborted"));
      },
      { once: true },
    );
  });
}
