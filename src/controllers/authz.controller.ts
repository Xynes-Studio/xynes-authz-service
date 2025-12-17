import type { Context } from "hono";
import { AuthzService } from "../services/authz.service";

/**
 * Generates a unique request ID for correlation.
 */
function generateRequestId(): string {
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export class AuthzController {
  static async check(c: Context) {
    const requestId = generateRequestId();
    const body = await c.req.json().catch(() => null);

    if (!body || !body.userId || !body.workspaceId || !body.actionKey) {
      return c.json(
        {
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Missing required fields: userId, workspaceId, actionKey",
          },
          meta: { requestId },
        },
        400
      );
    }

    const { userId, workspaceId, actionKey } = body;

    try {
      const allowed = await AuthzService.checkPermission(userId, workspaceId, actionKey);
      return c.json({
        ok: true,
        data: { allowed },
        meta: { requestId },
      });
    } catch (error) {
      console.error("Error checking permission:", { message: (error as Error).message, requestId });
      return c.json(
        {
          ok: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "An internal error occurred while checking permissions.",
          },
          meta: { requestId },
        },
        500
      );
    }
  }
}
