import {
  RequestProblem,
  responseModes,
  fitResponseResults,
  type AskEntry,
  type NlWebRequest,
  type NlWebResult,
} from "./protocol.ts";
import { deriveAnonymousActor } from "./actor.ts";
import { RequestEnvelopeProblem } from "./request-envelope.ts";
import { verifyBrowserChallenge, type AccessClass } from "./access-guard.ts";
import {
  enqueueDurableEvent,
  type DurableAskEvent,
  type TokenUsage,
} from "./durable-events.ts";
import {
  commitGeneration,
  reserveGeneration,
  reserveKeyRequest,
  reserveRequest,
  releaseKeyRequest,
  budgetExhaustedRejection,
} from "./usage-governor.ts";
import { authenticateMachineCredential, type TrustedMachineKey } from "./api-keys.ts";
import { redactValue, type CredentialCategory } from "./content-policy.ts";
import { buildBoundedModelContext } from "./model-context.ts";
import { DeadlineExceeded, RequestCancelled, RequestDeadline } from "./deadline.ts";
import {
  buildCacheRequest,
  cacheTtl,
  readExactCache,
  writeExactCache,
  type ExactCache,
} from "./exact-cache.ts";
import { getKnowledgeVersion } from "./knowledge-version.ts";
import { aiSearchOptions, RETRIEVAL_CONFIG, sourceResults } from "./retrieval.ts";
import { selectNoReferenceAnswer } from "./no-reference-answer.ts";
import {
  classifyRequestViolation,
  getManualBlock,
  getTemporaryBlock,
} from "./abuse-rules.ts";
import { violationRejection, securityRejection, internalErrorRejection, buildSecurityContext, type RejectionPayload, type RejectionRuntime } from "./abuse-guard.ts";
import { runPreAuthChecks } from "./pre-auth.ts";
import {
  answerCacheIdentity,
  generationBudgetFallback,
  modelInstructions,
  publicMessage,
  resolveInstancePolicy,
  type InstancePolicy,
} from "./instance-policy.ts";

type ChatCompletionMessage = {
  content?: unknown;
  reasoning_content?: unknown;
};

type ChatCompletionResponse = {
  choices?: Array<{ message?: ChatCompletionMessage }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
};

class UpstreamProblem extends Error {
  readonly failureCode: "AI_SEARCH_FAILED" | "MODEL_FAILED" | "AI_SEARCH_TIMEOUT" | "MODEL_TIMEOUT";

  constructor(failureCode: "AI_SEARCH_FAILED" | "MODEL_FAILED" | "AI_SEARCH_TIMEOUT" | "MODEL_TIMEOUT") {
    super(failureCode);
    this.failureCode = failureCode;
  }
}

function upstreamFailureDetail(failureCode: UpstreamProblem["failureCode"]) {
  return {
    stage: failureCode.startsWith("AI_SEARCH_") ? "retrieval" : "model",
    reason: failureCode.endsWith("_TIMEOUT") ? "timeout" : "failure",
    internal_code: failureCode,
  };
}

class UsageProblem extends Error {
  readonly failureCode: "GENERATION_RESERVE_FAILED" | "GENERATION_COMMIT_FAILED";

  constructor(failureCode: "GENERATION_RESERVE_FAILED" | "GENERATION_COMMIT_FAILED") {
    super(failureCode);
    this.failureCode = failureCode;
  }
}

class OutputProblem extends Error {
  constructor() {
    super("RESPONSE_TOO_LARGE");
  }
}

const jsonHeaders = { "content-type": "application/json; charset=utf-8" };
const PROMPT_VERSION = "public-ask-v2";
const AI_SEARCH_TIMEOUT_MS = 15_000;
const OUTPUT_LIMITS = { sourceCharacters: 1200, contextBytes: 10 * 1024, maxTokens: 1200, responseBytes: 128 * 1024 };

export type AskRuntime = {
  cache?: ExactCache;
  getCache?: () => Promise<ExactCache>;
  waitUntil?: (promise: Promise<unknown>) => void;
  personaVersion?: string;
};


type CachedAnswer = {
  answerId: string;
  text: string;
  results: NlWebResult[];
  model: string;
  usage: TokenUsage;
  redactionCategories: CredentialCategory[];
};

function messageText(message: ChatCompletionMessage | undefined): string {
  if (typeof message?.content === "string" && message.content.trim()) return message.content.trim();
  if (Array.isArray(message?.content)) {
    const joined = message.content
      .map((part) =>
        part && typeof part === "object" && "text" in part && typeof part.text === "string"
          ? part.text
          : "",
      )
      .join("")
      .trim();
    if (joined) return joined;
  }
  if (typeof message?.reasoning_content === "string" && message.reasoning_content.trim()) {
    return message.reasoning_content.trim();
  }
  return "";
}

async function generateSummary(
  request: NlWebRequest,
  sources: NlWebResult[],
  env: Env,
  policy: InstancePolicy,
  signal: AbortSignal,
): Promise<{ text: string; usage: TokenUsage }> {
  if (sources.length === 0) {
    return {
      text: selectNoReferenceAnswer(Math.random, policy.language),
      usage: { promptTokens: null, completionTokens: null, totalTokens: null },
    };
  }
  const endpoint = `https://gateway.ai.cloudflare.com/v1/${encodeURIComponent(env.AI_GATEWAY_ACCOUNT_ID)}/${encodeURIComponent(env.AI_GATEWAY_ID)}/deepseek/chat/completions`;
  const headers: Record<string, string> = {
    authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
    "content-type": "application/json",
  };
  if (env.CF_AIG_TOKEN) {
    headers["cf-aig-authorization"] = `Bearer ${env.CF_AIG_TOKEN}`;
  }
  if (!policy.persistInteractions) {
    headers["cf-aig-collect-log-payload"] = "false";
  }
  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: env.DEEPSEEK_MODEL,
      thinking: { type: "disabled" },
      temperature: 0.2,
      max_tokens: 1200,
      messages: [
        { role: "system", content: modelInstructions(policy, buildBoundedModelContext(sources)) },
        { role: "user", content: request.query.text },
      ],
    }),
    signal,
  });
  if (!response.ok) {
    throw new Error(`model_upstream_${response.status}`);
  }
  const payload: ChatCompletionResponse = await response.json();
  const text = messageText(payload.choices?.[0]?.message).trim();
  if (!text) throw new Error("model_empty_response");
  return {
    text,
    usage: {
      promptTokens: payload.usage?.prompt_tokens ?? null,
      completionTokens: payload.usage?.completion_tokens ?? null,
      totalTokens: payload.usage?.total_tokens ?? null,
    },
  };
}

function positiveLimit(value: string, name: string) {
  const limit = Number(value);
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error(`invalid_${name}`);
  return limit;
}

function interaction(
  requestId: string,
  createdAt: string,
  request: NlWebRequest,
  actorId: string | null,
  keyId: string | null,
  accessClass: AccessClass,
  status: "succeeded" | "failed",
  answerId: string | null,
  failureCode: string | null,
  redactionCategories: CredentialCategory[],
): DurableAskEvent["interaction"] {
  return {
    id: requestId,
    createdAt,
    question: request.query.text,
    request,
    actorId,
    keyId,
    accessClass,
    status,
    failureCode,
    answerId,
    redactionCategories,
  };
}

async function recordFailedInteraction(
  env: Env,
  deadline: RequestDeadline,
  requestId: string,
  createdAt: string,
  request: NlWebRequest,
  actorId: string | null,
  keyId: string | null,
  accessClass: AccessClass,
  failureCode: string,
) {
  const policy = resolveInstancePolicy(env, request.prefer?.["accept-language"]);
  if (!policy.persistInteractions) return;
  const queue = env.LEARNING_QUEUE;
  if (!queue) {
    console.error(JSON.stringify({
      event: "interaction_enqueue_error",
      requestId,
      actorId,
      keyId,
      accessClass,
      errorType: "MissingQueueBinding",
    }));
    return;
  }
  const redacted = redactValue(request);
  const event: DurableAskEvent = {
    version: 1,
    eventId: requestId,
    interaction: interaction(
      requestId,
      createdAt,
      redacted.value,
      actorId,
      keyId,
      accessClass,
      "failed",
      null,
      failureCode,
      redacted.categories,
    ),
    answer: null,
  };
  try {
    await deadline.run("queue", deadline.remainingMs(), (signal) =>
      enqueueDurableEvent(queue, event, signal));
  } catch (enqueueError) {
    console.error(JSON.stringify({
      event: "interaction_enqueue_error",
      requestId,
      actorId,
      keyId,
      accessClass,
      errorType: errorType(enqueueError),
    }));
  }
}

function errorType(error: unknown) {
  return error instanceof Error ? error.name : "UnknownError";
}


export type AskActionContext = {
  requestId: string;
  createdAt: string;
  method: string;
  route?: "/ask" | "/mcp";
  remoteIp: string;
  authorization: string | null;
  turnstileToken: string | null;
  preAuthCompleted?: boolean;
  payloadProvider: () => Promise<NlWebRequest>;
  signal: AbortSignal;
};

export type AskActionResult = {
  ok: true;
  results: NlWebResult[];
  answerId: string;
  text?: string;
  streaming?: boolean;
} | RejectionPayload;

export async function executeAskAction(
  context: AskActionContext,
  env: Env,
  runtime: AskRuntime = {}
): Promise<AskActionResult> {
  const { requestId, createdAt, method, remoteIp, authorization, turnstileToken, payloadProvider, signal } = context;
  const route = context.route ?? "/ask";
  const deadline = new RequestDeadline(signal, 45_000);
  let defaultPolicy: InstancePolicy;
  try {
    defaultPolicy = resolveInstancePolicy(env);
  } catch (error) {
    console.error(JSON.stringify({ event: "instance_policy_error", requestId, errorType: errorType(error) }));
    return internalErrorRejection("en");
  }
  let responseLanguage = defaultPolicy.language;
  async function storage<T>(operation: () => Promise<T>) {
    return deadline.run("storage", deadline.remainingMs(), () => operation());
  }
  const rejectionRuntime = { ...runtime, runStorage: storage };
  const security = (
    rejectionRuntimeForCall: RejectionRuntime,
    actorId: string | null,
    keyId: string | null,
    accessClass: AccessClass,
  ) => buildSecurityContext({
    env,
    runtime: rejectionRuntimeForCall,
    method,
    requestId,
    route,
    actorId,
    keyId,
    accessClass,
    language: responseLanguage,
  });
  
  const actorId = await deriveAnonymousActor(
    remoteIp,
    env.ACTOR_HMAC_KEY,
  );

  if (!context.preAuthCompleted) {
    const preAuth = await runPreAuthChecks(
      env,
      remoteIp,
      requestId,
      route,
      method,
      rejectionRuntime,
      storage,
      defaultPolicy.language,
    );
    if (!preAuth.ok) {
      return preAuth.rejection;
    }
  }
  const actorSubject = { type: "actor", id: actorId } as const;
  let parsed: NlWebRequest;
  try {
    parsed = await payloadProvider();
  } catch (error: any) {
    if (error instanceof RequestEnvelopeProblem) {
      const reason = classifyRequestViolation({ kind: "envelope", message: error.message });
      return violationRejection(security(rejectionRuntime, actorId, null, "anonymous"), actorSubject, reason ?? "INVALID_QUERY_SHAPE", error.code, publicMessage(responseLanguage, "invalidQuery"), 400);
    } else if (error instanceof RequestProblem) {
      const reason = classifyRequestViolation({ kind: "request", code: error.code, message: error.message });
      return violationRejection(security(rejectionRuntime, actorId, null, "anonymous"), actorSubject, reason ?? "INVALID_QUERY_SHAPE", error.code, publicMessage(responseLanguage, "invalidQuery"), 400);
    }
    return violationRejection(security(rejectionRuntime, actorId, null, "anonymous"), actorSubject, "JSON_MALFORMED", "INVALID_QUERY", publicMessage(responseLanguage, "invalidQuery"), 400);
  }
  const policy = resolveInstancePolicy(env, parsed.prefer?.["accept-language"]);
  responseLanguage = policy.language;
  const entry: AskEntry = route === "/mcp" ? "mcp" : "http";
  const modes = responseModes(parsed.prefer?.mode, entry);
  let accessClass: AccessClass = "anonymous";
  let trustedKey: TrustedMachineKey | null = null;

  if (authorization) {
    let authentication;
    try {
      authentication = await storage(() => authenticateMachineCredential(env.DB, authorization));
    } catch (error) {
      console.error(JSON.stringify({ event: "api_key_store_error", requestId, errorType: errorType(error) }));
      return internalErrorRejection(policy.language);
    }
    if (!authentication.ok) {
      console.warn(JSON.stringify({ event: "api_key_rejected", requestId, reason: authentication.reason }));
      const reason = classifyRequestViolation({ kind: "api_key", reason: authentication.reason });
      return violationRejection(security(rejectionRuntime, actorId, authentication.reason === "revoked" ? authentication.keyId : null, "anonymous"), actorSubject, 
        reason ?? "API_KEY_INVALID",
        "UNAUTHORIZED",
        publicMessage(policy.language, "apiKeyInvalid"),
        401, 
        false, 
      );
    }
    trustedKey = authentication.key;
    const keySubject = { type: "key", id: trustedKey.keyId } as const;
    try {
      const keyBlock = await storage(() => getTemporaryBlock(env.DB, keySubject));
      if (keyBlock) {
        return securityRejection(security(runtime, null, trustedKey.keyId, "trusted_machine"),  "temporary_block",  "TEMPORARY_BLOCK_ACTIVE",  "RATE_LIMITED",  publicMessage(policy.language, "temporarilyBlocked"),  429,  keyBlock.retryAfter,
    );
      }
      const manualBlock = await storage(() => getManualBlock(env.DB, keySubject));
      if (manualBlock) {
        return securityRejection(security(runtime, null, trustedKey.keyId, "trusted_machine"),  "manual_block",  manualBlock.reasonCode,  "FORBIDDEN",  publicMessage(policy.language, "forbidden"),  403,
    );
      }
    } catch (error) {
      console.error(JSON.stringify({ event: "abuse_store_error", requestId, errorType: errorType(error) }));
      return internalErrorRejection(policy.language);
    }
    if (modes.some((mode) => !trustedKey!.allowedModes.includes(mode as "list" | "summarize"))) {
      return violationRejection(security(rejectionRuntime, null, trustedKey.keyId, "trusted_machine"), keySubject,  "MODE_FORBIDDEN",  "FORBIDDEN",  publicMessage(policy.language, "apiKeyModeForbidden"),  403,
    );
    }
    const keyRate = await env.KEY_RATE_LIMITER.limit({ key: `key:${trustedKey.keyId}` });
    if (!keyRate.success) {
      return securityRejection(security(runtime, null, trustedKey.keyId, "trusted_machine"),  "rate_limit",  "KEY_RATE_LIMIT",  "RATE_LIMITED",  publicMessage(policy.language, "keyRateLimited"),  429,  60,
    );
    }
    accessClass = "trusted_machine";
  } else if (modes.includes("summarize")) {
    if (route === "/mcp") {
      return violationRejection(
        security(rejectionRuntime, actorId, null, "anonymous"),
        actorSubject,
        "MODE_FORBIDDEN",
        "FORBIDDEN",
        publicMessage(policy.language, "summarizeAuthRequired"),
        403,
      );
    }
    const token = turnstileToken;
    if (!token) {
      return violationRejection(security(rejectionRuntime, actorId, null, "anonymous"), actorSubject,  "CHALLENGE_REQUIRED",  "CHALLENGE_REQUIRED",  publicMessage(policy.language, "challengeRequired"),  403,
    );
    }
    let challenge;
    try {
      challenge = await deadline.run("siteverify", 3_000, (signal) =>
        verifyBrowserChallenge({
          token,
          secret: env.TURNSTILE_SECRET_KEY,
          expectedHostname: env.TURNSTILE_EXPECTED_HOSTNAME ?? new URL(env.ALLOWED_ORIGIN).hostname,
          expectedAction: env.TURNSTILE_EXPECTED_ACTION === ""
            ? undefined
            : env.TURNSTILE_EXPECTED_ACTION ?? "public-ask",
          remoteIp: remoteIp || undefined,
          signal,
        }));
    } catch (error) {
      if (error instanceof RequestCancelled) {
        return { ok: false, code: "UPSTREAM_ERROR", message: publicMessage(policy.language, "clientCancelled"), status: 499 };
      }
      console.warn(JSON.stringify({
        event: "turnstile_verification_failed",
        requestId,
        errorType: errorType(error),
        elapsedMs: 3_000,
      }));
      return securityRejection(security(runtime, actorId, null, "anonymous"),  "reject",  "CHALLENGE_UNAVAILABLE",  "UPSTREAM_TIMEOUT",  publicMessage(policy.language, "challengeUnavailable"),  504,
    );
    }
    if (!challenge.ok) {
      if (challenge.diagnostic) {
        console.warn(JSON.stringify({ event: "turnstile_verification_failed", requestId, ...challenge.diagnostic }));
      }
      const message = challenge.code === "CHALLENGE_EXPIRED"
        ? publicMessage(policy.language, "challengeExpired")
        : publicMessage(policy.language, "challengeFailed");
      const reason = classifyRequestViolation({ kind: "challenge", code: challenge.code });
      if (reason) {
        return violationRejection(security(rejectionRuntime, actorId, null, "anonymous"), actorSubject,  reason,  challenge.code,  message,  403, 
    );
      }
      return securityRejection(security(runtime, actorId, null, "anonymous"),  "reject",  challenge.code,  challenge.code,  message,  403, 
    );
    }
    const browserRate = await env.BROWSER_RATE_LIMITER.limit({ key: `browser:${actorId}` });
    if (!browserRate.success) {
      return securityRejection(security(runtime, actorId, null, "challenge_verified_browser_request"),  "rate_limit",  "BROWSER_RATE_LIMIT",  "RATE_LIMITED",  publicMessage(policy.language, "browserRateLimited"),  429,  60,
    );
    }
    accessClass = "challenge_verified_browser_request";
  }
  const durableActorId = trustedKey ? null : actorId;
  const durableKeyId = trustedKey?.keyId ?? null;
  let requestLimit: number;
  let generationLimit: number;
  try {
    requestLimit = positiveLimit(env.DAILY_REQUEST_LIMIT, "daily_request_limit");
    generationLimit = positiveLimit(env.DAILY_GENERATION_LIMIT, "daily_generation_limit");
  } catch (error) {
    console.error(JSON.stringify({ event: "usage_policy_error", requestId, errorType: errorType(error) }));
    return internalErrorRejection(policy.language);
  }
  const budgetNow = new Date();
  let keyRequestReserved = false;
  if (trustedKey) {
    try {
      keyRequestReserved = await storage(() =>
        reserveKeyRequest(env.DB, trustedKey!.keyId, trustedKey!.dailyLimit, budgetNow));
    } catch (error) {
      console.error(JSON.stringify({ event: "key_budget_error", requestId, keyId: trustedKey.keyId, errorType: errorType(error) }));
      return internalErrorRejection(policy.language);
    }
    if (!keyRequestReserved) {
      return budgetExhaustedRejection(budgetNow, publicMessage(policy.language, "keyBudgetExhausted"));
    }
  }
  try {
    if (!(await storage(() => reserveRequest(env.DB, requestLimit, budgetNow)))) {
      if (trustedKey && keyRequestReserved) {
        await storage(() => releaseKeyRequest(env.DB, trustedKey!.keyId, budgetNow));
      }
      return budgetExhaustedRejection(budgetNow, publicMessage(policy.language, "requestBudgetExhausted"));
    }
  } catch (error) {
    if (trustedKey && keyRequestReserved) {
      try {
        await storage(() => releaseKeyRequest(env.DB, trustedKey!.keyId, budgetNow));
      } catch (releaseError) {
        console.error(JSON.stringify({ event: "key_budget_release_error", requestId, keyId: trustedKey.keyId, errorType: errorType(releaseError) }));
      }
    }
    console.error(JSON.stringify({ event: "request_budget_error", requestId, errorType: errorType(error) }));
    return internalErrorRejection(policy.language);
  }

  try {
    const knowledgeVersion = await storage(() => getKnowledgeVersion(env.DB));
    let exactCache = runtime.cache;
    if (!exactCache && runtime.getCache) {
      try {
        exactCache = await runtime.getCache();
      } catch {
        console.warn(JSON.stringify({ event: "cache_error", requestId, cacheType: "all", operation: "open" }));
      }
    }
    const normalizedQuery = parsed.query.text.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
    const language = policy.language;
    const normalizedModes = [...modes].sort();
    const requestRedaction = redactValue(parsed);
    const cacheAllowed = requestRedaction.categories.length === 0 && Boolean(exactCache);
    const retrievalKey = await buildCacheRequest("retrieval", knowledgeVersion, {
      query: normalizedQuery,
      language,
      mode: normalizedModes,
      retrieval: RETRIEVAL_CONFIG,
    });
    let retrievalMiss = true;
    let sources: NlWebResult[] | null = null;
    if (cacheAllowed && exactCache) {
      const cached = await readExactCache<{ sources: NlWebResult[] }>(exactCache, retrievalKey);
      if (cached.status === "hit" && Array.isArray(cached.value?.sources)) {
        sources = cached.value.sources;
        retrievalMiss = false;
      } else if (cached.status === "error" || cached.status === "hit") {
        console.warn(JSON.stringify({ event: "cache_error", requestId, cacheType: "retrieval", operation: "read" }));
      }
    }
    if (!sources) {
      let search: AiSearchSearchResponse;
      try {
        search = await deadline.run("ai_search", AI_SEARCH_TIMEOUT_MS, () => env.PUBLIC_CONTENT.search({
          query: parsed.query.text,
          ai_search_options: aiSearchOptions(),
        }));
      } catch (error) {
        if (error instanceof DeadlineExceeded) throw new UpstreamProblem("AI_SEARCH_TIMEOUT");
        if (error instanceof RequestCancelled) throw error;
        throw new UpstreamProblem("AI_SEARCH_FAILED");
      }
      sources = sourceResults(search, policy.siteUrl);
    }
    const answerKey = await buildCacheRequest("answer", knowledgeVersion, {
      query: normalizedQuery,
      language,
      mode: normalizedModes,
      retrieval: RETRIEVAL_CONFIG,
      model: env.DEEPSEEK_MODEL,
      prompt: {
        base: PROMPT_VERSION,
        ...answerCacheIdentity(policy, runtime.personaVersion),
      },
      output: OUTPUT_LIMITS,
    });
    let cachedAnswer: CachedAnswer | null = null;
    if (cacheAllowed && exactCache && modes.includes("summarize") && sources.length > 0) {
      const cached = await readExactCache<CachedAnswer>(exactCache, answerKey);
      if (
        cached.status === "hit" &&
        typeof cached.value?.answerId === "string" &&
        typeof cached.value?.text === "string" &&
        Array.isArray(cached.value?.results)
      ) cachedAnswer = cached.value;
      else if (cached.status === "error" || cached.status === "hit") {
        console.warn(JSON.stringify({ event: "cache_error", requestId, cacheType: "answer", operation: "read" }));
      }
    }
    let generated: { text: string; usage: TokenUsage };
    let generationDegraded = false;
    try {
      if (cachedAnswer) {
        generated = { text: cachedAnswer.text, usage: cachedAnswer.usage };
      } else if (modes.includes("summarize") && sources.length > 0) {
        let reserved: boolean;
        try {
          reserved = await storage(() => reserveGeneration(env.DB, generationLimit, budgetNow));
        } catch (error) {
          console.error(JSON.stringify({ event: "generation_budget_error", requestId, errorType: errorType(error) }));
          throw new UsageProblem("GENERATION_RESERVE_FAILED");
        }
        if (!reserved) {
          generationDegraded = true;
          generated = {
            text: generationBudgetFallback(policy.language, sources),
            usage: { promptTokens: null, completionTokens: null, totalTokens: null },
          };
        } else {
          try {
            generated = await deadline.run("model", 10_000, (signal) =>
              generateSummary(parsed, sources, env, policy, signal));
          } finally {
            try {
              await storage(() => commitGeneration(env.DB, budgetNow));
            } catch {
              throw new UsageProblem("GENERATION_COMMIT_FAILED");
            }
          }
        }
      } else {
        generated = modes.includes("summarize")
          ? await deadline.run("model", 10_000, (signal) =>
            generateSummary(parsed, sources, env, policy, signal))
          : { text: "", usage: { promptTokens: null, completionTokens: null, totalTokens: null } };
      }
    } catch (error) {
      if (error instanceof UsageProblem) throw error;
      if (error instanceof DeadlineExceeded) throw new UpstreamProblem("MODEL_TIMEOUT");
      if (error instanceof RequestCancelled) throw error;
      throw new UpstreamProblem("MODEL_FAILED");
    }
    const rawResults = cachedAnswer?.results ?? (generated.text
      ? [{ "@type": "SearchSummary", text: generated.text } satisfies NlWebResult, ...sources]
      : sources);
    const redactedRequest = requestRedaction;
    const redactedResults = redactValue(rawResults);
    let results: NlWebResult[];
    try {
      results = fitResponseResults(requestId, redactedResults.value);
    } catch {
      throw new OutputProblem();
    }
    const safeAnswer = redactValue(generated.text).value;

    const answerId = cachedAnswer?.answerId ?? requestId;
    const event: DurableAskEvent = {
      version: 1,
      eventId: requestId,
      interaction: interaction(
        requestId,
        createdAt,
        redactedRequest.value,
        durableActorId,
        durableKeyId,
        accessClass,
        "succeeded",
        answerId,
        null,
        redactedRequest.categories,
      ),
      answer: cachedAnswer ? null : {
        id: requestId,
        createdAt,
        text: safeAnswer,
        results,
        model: modes.includes("summarize") && sources.length > 0 && !generationDegraded
          ? env.DEEPSEEK_MODEL
          : "none",
        usage: generated.usage,
        redactionCategories: redactedResults.categories,
      },
    };
    if (policy.persistInteractions) {
      const queue = env.LEARNING_QUEUE;
      if (!queue) {
        console.error(JSON.stringify({
          event: "durable_event_enqueue_failed",
          requestId,
          actorId: durableActorId,
          keyId: durableKeyId,
          accessClass,
          errorType: "MissingQueueBinding",
        }));
        return internalErrorRejection(policy.language);
      }
      try {
        await deadline.run("queue", deadline.remainingMs(), (signal) =>
          enqueueDurableEvent(queue, event, signal));
      } catch (error) {
        console.error(
          JSON.stringify({ event: "durable_event_enqueue_failed", requestId, actorId: durableActorId, keyId: durableKeyId, accessClass, errorType: errorType(error) }),
        );
        return internalErrorRejection(policy.language);
      }
    }

    const cacheCategories = [...new Set([...redactedRequest.categories, ...redactedResults.categories])];
    if (cacheAllowed && cacheCategories.length === 0 && exactCache && runtime.waitUntil) {
      if (retrievalMiss) {
        runtime.waitUntil(writeExactCache(exactCache, retrievalKey, { sources }, cacheTtl.retrieval).then((ok) => {
          if (!ok) console.warn(JSON.stringify({ event: "cache_error", requestId, cacheType: "retrieval", operation: "write" }));
        }));
      }
      if (!cachedAnswer && !generationDegraded && modes.includes("summarize") && sources.length > 0) {
        const value: CachedAnswer = {
          answerId,
          text: safeAnswer,
          results,
          model: env.DEEPSEEK_MODEL,
          usage: generated.usage,
          redactionCategories: redactedResults.categories,
        };
        runtime.waitUntil(writeExactCache(exactCache, answerKey, value, cacheTtl.answer).then((ok) => {
          if (!ok) console.warn(JSON.stringify({ event: "cache_error", requestId, cacheType: "answer", operation: "write" }));
        }));
      }
    }

    console.log(JSON.stringify({
      event: "public_ask_ok",
      requestId,
      actorId: durableActorId,
      keyId: durableKeyId,
      accessClass,
      resultCount: results.length,
      redactionCategories: [...new Set([...redactedRequest.categories, ...redactedResults.categories])].sort(),
    }));
    return { ok: true, results, answerId, text: safeAnswer, streaming: parsed.prefer?.streaming };
  } catch (error) {
    if (error instanceof UpstreamProblem) {
      await recordFailedInteraction(env, deadline, requestId, createdAt, parsed, durableActorId, durableKeyId, accessClass, error.failureCode);
      const detail = upstreamFailureDetail(error.failureCode);
      console.error(JSON.stringify({ event: "public_ask_failed", requestId, actorId: durableActorId, keyId: durableKeyId, accessClass, failureCode: error.failureCode, ...detail }));
      const timedOut = error.failureCode.endsWith("_TIMEOUT");
      return {
        ok: false,
        code: timedOut ? "UPSTREAM_TIMEOUT" : "UPSTREAM_ERROR",
        message: publicMessage(policy.language, timedOut ? "upstreamTimeout" : "upstreamFailure"),
        status: timedOut ? 504 : 502,
        detail,
      };
    }
    if (error instanceof UsageProblem) {
      await recordFailedInteraction(env, deadline, requestId, createdAt, parsed, durableActorId, durableKeyId, accessClass, error.failureCode);
      console.error(JSON.stringify({ event: "usage_governor_failed", requestId, actorId: durableActorId, keyId: durableKeyId, accessClass, failureCode: error.failureCode }));
      return internalErrorRejection(policy.language);
    }
    if (error instanceof RequestCancelled) {
      await recordFailedInteraction(env, deadline, requestId, createdAt, parsed, durableActorId, durableKeyId, accessClass, "CLIENT_CANCELLED");
      return { ok: false, code: "UPSTREAM_ERROR", message: publicMessage(policy.language, "clientCancelled"), status: 499 };
    }
    if (error instanceof OutputProblem) {
      await recordFailedInteraction(env, deadline, requestId, createdAt, parsed, durableActorId, durableKeyId, accessClass, "RESPONSE_TOO_LARGE");
      return { ok: false, code: "INTERNAL_ERROR", message: publicMessage(policy.language, "responseTooLarge"), status: 500 };
    }
    console.error(JSON.stringify({ event: "public_ask_failed", requestId, actorId: durableActorId, keyId: durableKeyId, accessClass, errorType: errorType(error) }));
    return internalErrorRejection(policy.language);
  }

}

