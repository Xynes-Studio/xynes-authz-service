import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { requireInternalServiceAuth } from "../../middleware/internal-service-auth";
import { createErrorResponse, getOrCreateRequestId } from "../../lib/api-error";
import { assignRole } from "../../services/role-assignment.service";

const internalRoute = new Hono();

// Keep internal actions small; this is not a public upload endpoint.
internalRoute.use(
  "*",
  bodyLimit({
    maxSize: 32 * 1024,
    onError: (c) => {
      const requestId = getOrCreateRequestId(c);
      return c.json(createErrorResponse("VALIDATION_ERROR", "Request body too large", requestId), 400);
    },
  })
);

internalRoute.use("*", requireInternalServiceAuth());

const actionRequestSchema = z
  .object({
    actionKey: z.string().min(1).max(256),
    payload: z.unknown(),
  })
  .strict();

const assignRolePayloadSchema = z
  .object({
    userId: z.string().uuid(),
    workspaceId: z.string().uuid(),
    roleKey: z.enum(["workspace_owner", "workspace_member"]),
  })
  .strict();

internalRoute.post("/authz-actions", async (c) => {
  const requestId = getOrCreateRequestId(c);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(createErrorResponse("VALIDATION_ERROR", "Invalid JSON body", requestId), 400);
  }

  const parsed = actionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(createErrorResponse("VALIDATION_ERROR", "Invalid request body", requestId), 400);
  }

  const { actionKey, payload } = parsed.data;

  if (actionKey === "authz.assignRole") {
    const roleParsed = assignRolePayloadSchema.safeParse(payload);
    if (!roleParsed.success) {
      return c.json(createErrorResponse("VALIDATION_ERROR", "Payload validation failed", requestId), 400);
    }

    try {
      await assignRole(roleParsed.data);
      return c.json({ ok: true, data: { assigned: true }, meta: { requestId } }, 200);
    } catch (e) {
      console.error("Failed to assign role", { requestId, message: (e as Error).message });
      return c.json(createErrorResponse("INTERNAL_ERROR", "Failed to assign role", requestId), 500);
    }
  }

  return c.json(createErrorResponse("VALIDATION_ERROR", "Unknown actionKey", requestId), 400);
});

export { internalRoute };
