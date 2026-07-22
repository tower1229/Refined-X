import type { AccessClass } from "./access-guard.ts";
import { recordExplicitViolation, type AbuseReasonCode, type AbuseSubject } from "./abuse-rules.ts";
import {
  enqueueSecurityAudit,
  type PublicAskQueueEvent,
  type SecurityAuditEvent,
} from "./durable-events.ts";
import { failureResponse } from "./protocol.ts";

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
}): SecurityContext {
  return {
    env: params.env,
    runtime: params.runtime,
    method: params.method,
    requestId: params.requestId,
    route: params.route ?? "/ask",
    actorId: params.actorId,
    keyId: params.keyId,
    accessClass: params.accessClass,
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
    context.env.LEARNING_QUEUE as Queue<PublicAskQueueEvent>,
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

export function internalErrorRejection(): RejectionPayload {
  return { ok: false, code: "INTERNAL_ERROR", message: "公开问答服务暂时不可用。", status: 500 };
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
        "temporary_block", reasonCode, "RATE_LIMITED", "请求暂时被限制，请稍后再试。",
        429, block.retryAfter,
      );
    }
  } catch (error) {
    console.error(JSON.stringify({ event: "abuse_store_error", requestId: context.requestId, errorType: errorType(error) }));
    return internalErrorRejection();
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
