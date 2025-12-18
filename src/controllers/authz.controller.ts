import type { Context } from "hono";
import { checkPermission } from "../services/authz.service";
import { createErrorResponse, getOrCreateRequestId } from "../lib/api-error";
import { authzCheckRequestSchema } from "../validators/authz-check.validator";

export async function authzCheck(c: Context) {
  const requestId = getOrCreateRequestId(c);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch (error) {
    const err = error as { name?: unknown; message?: unknown };
    if (err?.name === "BodyLimitError" || err?.message === "Payload Too Large") {
      return c.json(createErrorResponse("VALIDATION_ERROR", "Request body too large", requestId), 400);
    }
    return c.json(createErrorResponse("VALIDATION_ERROR", "Invalid JSON body", requestId), 400);
  }

  const parsed = authzCheckRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(createErrorResponse("VALIDATION_ERROR", "Invalid request body", requestId), 400);
  }

  const { userId, workspaceId, actionKey } = parsed.data;

  try {
    const allowed = await checkPermission(userId, workspaceId, actionKey);
    return c.json({
      ok: true,
      data: { allowed },
      meta: { requestId },
    });
  } catch (error) {
    console.error("Error checking permission:", { message: (error as Error).message, requestId });
    return c.json(
      createErrorResponse("INTERNAL_ERROR", "An internal error occurred while checking permissions.", requestId),
      500
    );
  }
}
