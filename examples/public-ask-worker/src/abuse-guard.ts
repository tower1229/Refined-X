import type { AccessClass } from "./access-guard.ts";
import { recordExplicitViolation, type AbuseReasonCode, type AbuseSubject } from "./abuse-rules.ts";
import {
  enqueueSecurityAudit,
  type PublicAskQueueEvent,
  type SecurityAuditEvent,
} from "./durable-events.ts";
import { failureResponse } from "./protocol.ts";
import {
  publicMessage,
  resolveInstancePolicy,
  type SupportedLanguage,
} from "./instance-policy.ts";

export type RejectionRuntime = {
  waitUntil?: (promise: Promise<unknown>) => void;
  runStorage?: <T>(operation: () => Promise<T>) => Promise<T>;
};

export type SecurityRoute = "/ask" | "/mcp";

export type SecurityContext = {
  env: Env;
  runtime: RejectionRuntime;
  method: string;
  requestId: string;
  route: SecurityRoute;
  actorId: string | null;
  keyId: string | null;
  accessClass: AccessClass;
  language: SupportedLanguage;
  persistInteractions: boolean;
};

export function buildSecurityContext(params: {
  env: Env;
  runtime: RejectionRuntime;
  method: string;
  requestId: string;
  route?: SecurityRoute;
  actorId: string | null;
  keyId: string | null;
  accessClass: AccessClass;
  language?: SupportedLanguage;
}): SecurityContext {
  const policy = resolveInstancePolicy(params.env, params.language);
  return {
    env: params.env,
    runtime: params.runtime,
    method: params.method,
    requestId: params.requestId,
    route: params.route ?? "/ask",
    actorId: params.actorId,
    keyId: params.keyId,
    accessClass: params.accessClass,
    language: params.language ?? policy.language,
    persistInteractions: policy.persistInteractions,
  };
}

type SecurityAction = SecurityAuditEvent["securityAudit"]["action"];

function errorType(error: unknown) {
  return error instanceof Error ? error.name : "UnknownError";
}

function auditRejection(
  context: SecurityContext,
  action: SecurityAction,
  reasonCode: string,
) {
  console.warn(JSON.stringify({
    event: "security_decision",
    requestId: context.requestId,
    actorId: context.actorId,
    keyId: context.keyId,
    accessClass: context.accessClass,
    action,
    reasonCode,
  }));
  if (!context.persistInteractions) return;
  const queue = context.env.LEARNING_QUEUE;
  if (!queue) {
    console.error(JSON.stringify({
      event: "audit_enqueue_error",
      requestId: context.requestId,
      actorId: context.actorId,
      keyId: context.keyId,
      accessClass: context.accessClass,
      action,
      reasonCode,
      errorType: "MissingQueueBinding",
    }));
    return;
  }
  const event: SecurityAuditEvent = {
    version: 1,
    eventId: context.requestId,
    securityAudit: {
      id: context.requestId,
      createdAt: new Date().toISOString(),
      requestId: context.requestId,
      route: context.route,
      method: context.method,
      actorId: context.actorId,
      keyId: context.keyId,
      accessClass: context.accessClass,
      action,
      reasonCode,
    },
  };
  const enqueue = enqueueSecurityAudit(
    queue as Queue<PublicAskQueueEvent>,
    event,
  ).catch((error) => {
    console.error(JSON.stringify({
      event: "audit_enqueue_error",
      requestId: context.requestId,
      actorId: context.actorId,
      keyId: context.keyId,
      accessClass: context.accessClass,
      action,
      reasonCode,
      errorType: errorType(error),
    }));
  });
  if (context.runtime.waitUntil) context.runtime.waitUntil(enqueue);
  else void enqueue;
}

export type RejectionPayload = {
  ok: false;
  code: string;
  message: string;
  status: number;
  retryAfter?: number;
  detail?: Record<string, unknown>;
};

export function internalErrorRejection(language: SupportedLanguage = "en"): RejectionPayload {
  return {
    ok: false,
    code: "INTERNAL_ERROR",
    message: publicMessage(language, "internalError"),
    status: 500,
  };
}

export function securityRejection(
  context: SecurityContext,
  action: SecurityAction,
  reasonCode: string,
  code: string,
  message: string,
  status: number,
  retryAfter?: number,
): RejectionPayload {
  auditRejection(context, action, reasonCode);
  return { ok: false, code, message, status, retryAfter };
}

export function securityFailure(
  context: SecurityContext,
  action: SecurityAction,
  reasonCode: string,
  code: string,
  message: string,
  status: number,
  headers: HeadersInit,
  retryAfter?: number,
) {
  const rejection = securityRejection(context, action, reasonCode, code, message, status, retryAfter);
  return failureResponse(context.requestId, rejection.code, rejection.message, rejection.status, headers, rejection.retryAfter);
}

export async function violationRejection(
  context: SecurityContext,
  subject: AbuseSubject,
  reasonCode: AbuseReasonCode,
  code: string,
  message: string,
  status: number,
  allowTemporaryBlock = true,
): Promise<RejectionPayload> {
  try {
    const operation = () => recordExplicitViolation(context.env.DB, subject, context.requestId, reasonCode);
    const block = context.runtime.runStorage
      ? await context.runtime.runStorage(operation)
      : await operation();
    if (block && allowTemporaryBlock) {
      return securityRejection(
        context,
        "temporary_block", reasonCode, "RATE_LIMITED", publicMessage(context.language, "temporarilyBlocked"),
        429, block.retryAfter,
      );
    }
  } catch (error) {
    console.error(JSON.stringify({ event: "abuse_store_error", requestId: context.requestId, errorType: errorType(error) }));
    return internalErrorRejection(context.language);
  }
  return securityRejection(
    context,
    "reject", reasonCode, code, message, status,
  );
}

export async function violationFailure(
  context: SecurityContext,
  subject: AbuseSubject,
  reasonCode: AbuseReasonCode,
  code: string,
  message: string,
  status: number,
  headers: HeadersInit,
  allowTemporaryBlock = true,
) {
  const rejection = await violationRejection(context, subject, reasonCode, code, message, status, allowTemporaryBlock);
  return failureResponse(context.requestId, rejection.code, rejection.message, rejection.status, headers, rejection.retryAfter);
}
