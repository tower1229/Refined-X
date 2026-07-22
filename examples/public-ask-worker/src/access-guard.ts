export type ChallengeFailureCode =
  | "CHALLENGE_EXPIRED"
  | "CHALLENGE_INVALID"
  | "CHALLENGE_UNAVAILABLE";

export type AccessClass = "anonymous" | "challenge_verified_browser_request" | "trusted_machine";

type SiteverifyResponse = {
  success?: boolean;
  hostname?: string;
  action?: string;
  "error-codes"?: string[];
};

type VerifyBrowserChallengeOptions = {
  token: string;
  secret: string;
  expectedHostname: string;
  expectedAction?: string;
  remoteIp?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
};

type ChallengeDiagnostic = { status?: number; errorType?: string; elapsedMs: number };

export async function verifyBrowserChallenge({
  token,
  secret,
  expectedHostname,
  expectedAction,
  remoteIp,
  fetchImpl = fetch,
  signal,
}: VerifyBrowserChallengeOptions): Promise<{ ok: true } | { ok: false; code: ChallengeFailureCode; diagnostic?: ChallengeDiagnostic }> {
  const startedAt = Date.now();
  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) body.set("remoteip", remoteIp);
  try {
    const response = await fetchImpl("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(3_000)])
        : AbortSignal.timeout(3_000),
    });
    if (!response.ok) {
      return { ok: false, code: "CHALLENGE_UNAVAILABLE", diagnostic: { status: response.status, elapsedMs: Date.now() - startedAt } };
    }
    const result = await response.json() as SiteverifyResponse;
    if (result["error-codes"]?.includes("timeout-or-duplicate")) {
      return { ok: false, code: "CHALLENGE_EXPIRED" };
    }
    if (
      result.success !== true ||
      result.hostname !== expectedHostname ||
      (expectedAction !== undefined && result.action !== expectedAction)
    ) {
      return { ok: false, code: "CHALLENGE_INVALID" };
    }
    return { ok: true };
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    return {
      ok: false,
      code: "CHALLENGE_UNAVAILABLE",
      diagnostic: { errorType: error instanceof Error ? error.name : typeof error, elapsedMs: Date.now() - startedAt },
    };
  }
}
