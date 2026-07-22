import { deriveAnonymousActor } from "./actor.ts";
import {
  buildSecurityContext,
  internalErrorRejection,
  securityRejection,
  type RejectionPayload,
  type RejectionRuntime,
  type SecurityRoute,
} from "./abuse-guard.ts";
import { getManualBlock, getTemporaryBlock } from "./abuse-rules.ts";

function errorType(error: unknown) {
  return error instanceof Error ? error.name : "UnknownError";
}

export async function runPreAuthChecks(
  env: Env,
  remoteIp: string,
  requestId: string,
  route: SecurityRoute,
  method: string,
  runtime: RejectionRuntime = {},
  runStorage?: <T>(operation: () => Promise<T>) => Promise<T>,
): Promise<{ ok: true; actorId: string } | { ok: false; rejection: RejectionPayload }> {
  const actorId = await deriveAnonymousActor(remoteIp, env.ACTOR_HMAC_KEY);
  const security = () => buildSecurityContext({
    env,
    runtime,
    method,
    requestId,
    route,
    actorId,
    keyId: null,
    accessClass: "anonymous",
  });

  const rate = await env.ASK_RATE_LIMITER.limit({ key: `ask:${actorId}` });
  if (!rate.success) {
    return {
      ok: false,
      rejection: securityRejection(
        security(),
        "rate_limit",
        "PRE_AUTH_RATE_LIMIT",
        "RATE_LIMITED",
        "请求过于频繁，请稍后再试。",
        429,
        60,
      ),
    };
  }

  const actorSubject = { type: "actor", id: actorId } as const;
  const storage = runStorage ?? runtime.runStorage;
  try {
    const actorBlock = storage
      ? await storage(() => getTemporaryBlock(env.DB, actorSubject))
      : await getTemporaryBlock(env.DB, actorSubject);
    if (actorBlock) {
      return {
        ok: false,
        rejection: securityRejection(
          security(),
          "temporary_block",
          "TEMPORARY_BLOCK_ACTIVE",
          "RATE_LIMITED",
          "请求暂时被限制，请稍后再试。",
          429,
          actorBlock.retryAfter,
        ),
      };
    }
    const manualBlock = runStorage
      ? await runStorage(() => getManualBlock(env.DB, actorSubject))
      : await getManualBlock(env.DB, actorSubject);
    if (manualBlock) {
      return {
        ok: false,
        rejection: securityRejection(
          security(),
          "manual_block",
          manualBlock.reasonCode,
          "FORBIDDEN",
          "当前请求被访问规则拒绝。",
          403,
        ),
      };
    }
  } catch (error) {
    console.error(JSON.stringify({ event: "abuse_store_error", requestId, errorType: errorType(error) }));
    return { ok: false, rejection: internalErrorRejection() };
  }

  return { ok: true, actorId };
}
