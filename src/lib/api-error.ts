import type { Context } from "hono";

export interface ApiErrorEnvelope {
  ok: false;
  error: { code: string; message: string };
  meta: { requestId: string };
}

export function generateRequestId(): string {
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getOrCreateRequestId(c: Context): string {
  const existing = c.get("requestId");
  if (typeof existing === "string" && existing.length > 0) return existing;
  const requestId = generateRequestId();
  c.set("requestId", requestId);
  return requestId;
}

export function createErrorResponse(code: string, message: string, requestId: string): ApiErrorEnvelope {
  return { ok: false, error: { code, message }, meta: { requestId } };
}

