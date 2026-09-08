import {
  answerMeta,
  failureResponse,
  streamResponse,
  NLWEB_VERSION,
} from "./protocol.ts";
import { deriveAnonymousActor } from "./actor.ts";
import { handleMcp } from "./mcp-server.ts";
import { readRequestEnvelope, readJsonBody } from "./request-envelope.ts";
import {
  persistQueueEvent,
  type PublicAskQueueEvent,
} from "./durable-events.ts";
import { violationRejection, buildSecurityContext } from "./abuse-guard.ts";
import { getKnowledgeVersion, newestSuccessfulJob, refreshKnowledgeVersion } from "./knowledge-version.ts";
import { cleanupExpiredRecords } from "./retention.ts";
import { inspectBudgetThresholds } from "./budget-observability.ts";
import {
  publicMessage,
  resolveInstancePolicy,
  type InstancePolicy,
  type SupportedLanguage,
} from "./instance-policy.ts";
import {
  executeAskAction,
  type AskActionContext,
  type AskRuntime,
} from "./ask-service.ts";

export type { AskActionContext, AskActionResult, AskRuntime } from "./ask-service.ts";
export { executeAskAction } from "./ask-service.ts";

const jsonHeaders = { "content-type": "application/json; charset=utf-8" };

function errorType(error: unknown) {
  return error instanceof Error ? error.name : "UnknownError";
}

function positiveLimit(value: string, name: string) {
  const limit = Number(value);
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error(`invalid_${name}`);
  return limit;
}

function corsHeaders(request: Request, env: Env): HeadersInit {
  const origin = request.headers.get("origin");
  return origin === env.ALLOWED_ORIGIN
    ? {
        "access-control-allow-origin": origin,
        "access-control-allow-methods": "POST, OPTIONS",
        "access-control-allow-headers": "content-type, authorization, cf-turnstile-response",
        vary: "origin",
      }
    : {};
}


export async function handleAsk(request: Request, env: Env, runtime: AskRuntime = {}): Promise<Response> {
  const requestId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const headers = corsHeaders(request, env);
  let defaultLanguage: SupportedLanguage = "en";
  try {
    defaultLanguage = resolveInstancePolicy(env).language;
  } catch {
    // executeAskAction reports invalid instance configuration on normal POST requests.
  }

  if (request.method !== "POST") {
    return failureResponse(requestId, "INVALID_QUERY", publicMessage(defaultLanguage, "methodNotAllowed"), 405, headers);
  }

  const remoteIp = request.headers.get("cf-connecting-ip") ?? "unknown";
  const actorId = await deriveAnonymousActor(remoteIp, env.ACTOR_HMAC_KEY);
  const actorSubject = { type: "actor", id: actorId } as const;

  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    const rejection = await violationRejection(buildSecurityContext({
      env,
      runtime,
      method: request.method,
      requestId,
      route: "/ask",
      actorId,
      keyId: null,
      accessClass: "anonymous",
      language: defaultLanguage,
    }), actorSubject,
      "INVALID_CONTENT_TYPE",  "INVALID_QUERY",  publicMessage(defaultLanguage, "jsonRequired"),  415,
    );
    return failureResponse(requestId, rejection.code, rejection.message, rejection.status, headers, rejection.retryAfter);
  }



  const context: AskActionContext = {
    requestId,
    createdAt,
    method: request.method,
    remoteIp,
    authorization: request.headers.get("authorization"),
    turnstileToken: request.headers.get("cf-turnstile-response"),
    payloadProvider: () => readRequestEnvelope(request),
    signal: request.signal
  };

  const result = await executeAskAction(context, env, runtime);

  if (!result.ok) {
    const responseHeaders = result.retryAfter !== undefined
      ? { ...headers, "retry-after": String(result.retryAfter) }
      : headers;
    return failureResponse(requestId, result.code, result.message, result.status, responseHeaders, undefined, result.detail);
  }

  if (result.ok && result.streaming === true || request.headers.get("accept")?.includes("text/event-stream")) {
    return streamResponse(requestId, result.results, headers);
  }

  const responseHeaders = new Headers(headers);
  responseHeaders.set("x-request-id", requestId);
  return Response.json({ _meta: answerMeta(requestId), results: result.results }, { headers: responseHeaders });
}

async function authorized(request: Request, secret: string | undefined): Promise<boolean> {
  if (!secret) return false;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(supplied)),
    crypto.subtle.digest("SHA-256", encoder.encode(secret)),
  ]);
  const a = new Uint8Array(left);
  const b = new Uint8Array(right);
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) mismatch |= a[index] ^ b[index];
  return mismatch === 0 && supplied.length > 0;
}

export async function handleLearningExport(request: Request, env: Env, now = new Date()): Promise<Response> {
  let policy: InstancePolicy;
  try {
    policy = resolveInstancePolicy(env);
  } catch {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  if (!policy.persistInteractions) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  if (/^Bearer\s+pask_/i.test(request.headers.get("authorization") ?? "")) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!(await authorized(request, env.LEARNING_EXPORT_TOKEN))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (request.method === "GET") {
    const requestedLimit = Number.parseInt(new URL(request.url).searchParams.get("limit") ?? "50", 10);
    const limit = Number.isSafeInteger(requestedLimit) ? Math.max(1, Math.min(requestedLimit, 200)) : 50;
    const interactions = await env.DB.prepare(
      `SELECT id, event_id, created_at, expires_at, question, request_json, actor_id, key_id,
              access_class, status, failure_code, answer_id, redaction_categories
       FROM public_ask_interactions
       WHERE exported_at IS NULL AND expires_at > ?1
       ORDER BY created_at ASC
       LIMIT ?2`,
    )
      .bind(now.toISOString(), limit)
      .all();
    const answers = await env.DB.prepare(
      `SELECT a.id, a.created_at, a.expires_at, a.answer, a.results_json, a.model,
              a.prompt_tokens, a.completion_tokens, a.total_tokens, a.redaction_categories,
              (SELECT COUNT(*) FROM public_ask_interactions all_i WHERE all_i.answer_id = a.id) AS interaction_count
       FROM public_ask_answers a
       WHERE a.expires_at > ?1 AND a.id IN (
         SELECT answer_id FROM (
           SELECT answer_id
           FROM public_ask_interactions
           WHERE exported_at IS NULL AND expires_at > ?1 AND answer_id IS NOT NULL
           ORDER BY created_at ASC
           LIMIT ?2
         )
       )
       ORDER BY a.created_at ASC`,
    )
      .bind(now.toISOString(), limit)
      .all();
    return Response.json(
      { interactions: interactions.results, answers: answers.results },
      { headers: { "cache-control": "no-store" } },
    );
  }
  if (request.method === "POST") {
    let body: unknown;
    try {
      body = await readJsonBody(request, 16 * 1024);
    } catch {
      return Response.json({ error: "invalid_json" }, { status: 400 });
    }
    if (
      !body ||
      typeof body !== "object" ||
      !("interactionIds" in body) ||
      !Array.isArray(body.interactionIds)
    ) {
      return Response.json({ error: "interactionIds must be an array" }, { status: 400 });
    }
    const ids = body.interactionIds.filter((id): id is string => typeof id === "string").slice(0, 200);
    if (ids.length === 0) return Response.json({ updated: 0 });
    const placeholders = ids.map((_, index) => `?${index + 1}`).join(",");
    const expired = await env.DB.prepare(
      `SELECT COUNT(*) AS expired FROM public_ask_interactions
       WHERE id IN (${placeholders}) AND expires_at <= ?${ids.length + 1}`,
    ).bind(...ids, now.toISOString()).first<{ expired: number }>();
    if ((expired?.expired ?? 0) > 0) return Response.json({ error: "expired_records" }, { status: 409 });
    const acknowledgedAt = now.toISOString();
    await env.DB.batch(
      ids.map((id) =>
        env.DB.prepare("UPDATE public_ask_interactions SET exported_at = ?1 WHERE id = ?2 AND expires_at > ?1").bind(acknowledgedAt, id),
      ),
    );
    return Response.json({ updated: ids.length });
  }
  return Response.json({ error: "method_not_allowed" }, { status: 405 });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    if (url.pathname === "/ask") {
      return handleAsk(request, env, {
        getCache: () => caches.open("public-ask-exact-v1"),
        waitUntil: (promise) => ctx.waitUntil(promise),
      });
    }
    if (url.pathname === "/mcp") {
      return handleMcp(request, env, {
        getCache: () => caches.open("public-ask-exact-v1"),
        waitUntil: (promise) => ctx.waitUntil(promise),
      });
    }
    if (url.pathname === "/internal/learning/records") return handleLearningExport(request, env);
    if (url.pathname === "/health") {
      if (url.searchParams.get("check") === "search") {
        try {
          const [info, jobs, knowledgeVersion] = await Promise.all([
            env.PUBLIC_CONTENT.info(),
            env.PUBLIC_CONTENT.jobs.list({ page: 1, per_page: 10 }),
            getKnowledgeVersion(env.DB),
          ]);
          const latestSuccessful = newestSuccessfulJob(jobs.result);
          const activeJob = jobs.result.find((job) => job.started_at && !job.ended_at) ?? null;
          const ready = info.status !== "error" && !activeJob;
          return Response.json(
            {
              ok: ready,
              ai_search: {
                id: info.id,
                status: info.status,
                knowledge_version: knowledgeVersion,
                latest_successful_job: latestSuccessful,
                active_job: activeJob
                  ? { id: activeJob.id, started_at: activeJob.started_at, source: activeJob.source }
                  : null,
                recent_jobs: jobs.result.slice(0, 5).map((job) => ({
                  id: job.id,
                  source: job.source,
                  started_at: job.started_at,
                  ended_at: job.ended_at,
                  end_reason: job.end_reason,
                })),
              },
            },
            { status: ready ? 200 : 503, headers: jsonHeaders },
          );
        } catch (error) {
          return Response.json(
            { ok: false, ai_search: String(error) },
            { status: 503, headers: jsonHeaders },
          );
        }
      }
      return Response.json({ ok: true, nlweb: NLWEB_VERSION }, { headers: jsonHeaders });
    }
    return Response.json({ error: "not_found" }, { status: 404, headers: jsonHeaders });
  },

  async queue(batch, env) {
    for (const message of batch.messages) {
      const event = message.body;
      try {
        await persistQueueEvent(env.DB, event);
        message.ack();
      } catch (error) {
        console.error(JSON.stringify({ event: "durable_event_failed", eventId: event.eventId, errorType: errorType(error) }));
        message.retry();
      }
    }
  },

  async scheduled(_controller, env) {
    try {
      const events = await inspectBudgetThresholds(
        env.DB,
        positiveLimit(env.DAILY_REQUEST_LIMIT, "daily_request_limit"),
        positiveLimit(env.DAILY_GENERATION_LIMIT, "daily_generation_limit"),
      );
      for (const event of events) console.warn(JSON.stringify(event));
    } catch (error) {
      console.error(JSON.stringify({ event: "budget_observation_failed", errorType: errorType(error) }));
    }
    try {
      await cleanupExpiredRecords(env.DB);
      console.log(JSON.stringify({ event: "retention_cleanup_completed" }));
    } catch (error) {
      console.error(JSON.stringify({ event: "retention_cleanup_failed", errorType: errorType(error) }));
    }
    try {
      const version = await refreshKnowledgeVersion(env);
      console.log(JSON.stringify({ event: "knowledge_version_refreshed", version }));
    } catch (error) {
      console.error(JSON.stringify({ event: "knowledge_version_refresh_failed", errorType: errorType(error) }));
    }
  },
} satisfies ExportedHandler<Env, PublicAskQueueEvent>;
