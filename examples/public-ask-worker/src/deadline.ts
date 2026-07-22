export type RequestStage = "siteverify" | "ai_search" | "model" | "storage" | "queue";

export class DeadlineExceeded extends Error {
  readonly stage: RequestStage;

  constructor(stage: RequestStage) {
    super(`${stage}_timeout`);
    this.stage = stage;
  }
}

export class RequestCancelled extends Error {
  constructor() {
    super("request_cancelled");
  }
}

export class RequestDeadline {
  readonly #startedAt = Date.now();
  readonly #requestSignal?: AbortSignal;
  readonly #totalMs: number;

  constructor(requestSignal?: AbortSignal, totalMs = 45_000) {
    this.#requestSignal = requestSignal;
    this.#totalMs = totalMs;
  }

  remainingMs() {
    return Math.max(0, this.#totalMs - (Date.now() - this.#startedAt));
  }

  async run<T>(
    stage: RequestStage,
    stageMs: number,
    operation: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const budget = Math.max(1, Math.min(stageMs, this.remainingMs()));
    const timeoutSignal = AbortSignal.timeout(budget);
    const signals = this.#requestSignal ? [this.#requestSignal, timeoutSignal] : [timeoutSignal];
    const signal = AbortSignal.any(signals);
    return new Promise<T>((resolve, reject) => {
      const onAbort = () => {
        reject(this.#requestSignal?.aborted && !timeoutSignal.aborted
          ? new RequestCancelled()
          : new DeadlineExceeded(stage));
      };
      signal.addEventListener("abort", onAbort, { once: true });
      Promise.resolve()
        .then(() => operation(signal))
        .then(resolve, reject)
        .finally(() => signal.removeEventListener("abort", onAbort));
    });
  }
}
