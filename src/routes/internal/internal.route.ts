import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { requireInternalServiceAuth } from "../../middleware/internal-service-auth";
import { createErrorResponse, getOrCreateRequestId } from "../../lib/api-error";
import { assignRole } from "../../services/role-assignment.service";
import { listRolesForWorkspace } from "../../services/role-listing.service";
import { ensureAuthzSeeded } from "../../infra/ensure-seeded";

type InternalRouteDeps = {
  assignRole?: typeof assignRole;
  listRolesForWorkspace?: typeof listRolesForWorkspace;
  ensureAuthzSeeded?: typeof ensureAuthzSeeded;
};

export function createInternalRoute(deps: InternalRouteDeps = {}) {
  const resolvedAssignRole = deps.assignRole ?? assignRole;
  const resolvedListRolesForWorkspace =
    deps.listRolesForWorkspace ?? listRolesForWorkspace;
  const resolvedEnsureAuthzSeeded = deps.ensureAuthzSeeded ?? ensureAuthzSeeded;

  const internalRoute = new Hono();

  // Keep internal actions small; this is not a public upload endpoint.
  internalRoute.use(
    "*",
    bodyLimit({
      maxSize: 32 * 1024,
      onError: (c) => {
        const requestId = getOrCreateRequestId(c);
        return c.json(
          createErrorResponse(
            "VALIDATION_ERROR",
            "Request body too large",
            requestId,
          ),
          400,
        );
      },
    }),
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

  const listRolesPayloadSchema = z
    .object({
      workspaceId: z.string().uuid(),
      userIds: z.array(z.string().uuid()).optional(),
    })
    .strict();

  internalRoute.post("/authz-actions", async (c) => {
    const requestId = getOrCreateRequestId(c);

    const body: unknown = await c.req.json();

    const parsed = actionRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        createErrorResponse(
          "VALIDATION_ERROR",
          "Invalid request body",
          requestId,
        ),
        400,
      );
    }

    const { actionKey, payload } = parsed.data;

    if (actionKey === "authz.assignRole") {
      const roleParsed = assignRolePayloadSchema.safeParse(payload);
      if (!roleParsed.success) {
        return c.json(
          createErrorResponse(
            "VALIDATION_ERROR",
            "Payload validation failed",
            requestId,
          ),
          400,
        );
      }

      try {
        await resolvedEnsureAuthzSeeded();
        await resolvedAssignRole(roleParsed.data);
        return c.json(
          { ok: true, data: { assigned: true }, meta: { requestId } },
          200,
        );
      } catch {
        console.error("Failed to assign role", { requestId });
        return c.json(
          createErrorResponse(
            "INTERNAL_ERROR",
            "Failed to assign role",
            requestId,
          ),
          500,
        );
      }
    }

    if (actionKey === "authz.listRolesForWorkspace") {
      const listParsed = listRolesPayloadSchema.safeParse(payload);
      if (!listParsed.success) {
        return c.json(
          createErrorResponse(
            "VALIDATION_ERROR",
            "Payload validation failed",
            requestId,
          ),
          400,
        );
      }

      try {
        await resolvedEnsureAuthzSeeded();
        const roles = await resolvedListRolesForWorkspace(listParsed.data);
        return c.json({ ok: true, data: { roles }, meta: { requestId } }, 200);
      } catch {
        console.error("Failed to list roles", { requestId });
        return c.json(
          createErrorResponse(
            "INTERNAL_ERROR",
            "Failed to list roles",
            requestId,
          ),
          500,
        );
      }
    }

    return c.json(
      createErrorResponse("VALIDATION_ERROR", "Unknown actionKey", requestId),
      400,
    );
  });

  return internalRoute;
}

const internalRoute = createInternalRoute();

export { internalRoute };
