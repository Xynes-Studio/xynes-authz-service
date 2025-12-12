import { Context } from "hono";
import { AuthzService } from "../services/authz.service";

export class AuthzController {
    static async check(c: Context) {
        const body = await c.req.json().catch(() => null);
    
        if (!body || !body.userId || !body.workspaceId || !body.actionKey) {
            return c.json({ error: "Missing required fields" }, 400);
        }
        
        const { userId, workspaceId, actionKey } = body;
        
        try {
            const allowed = await AuthzService.checkPermission(userId, workspaceId, actionKey);
            return c.json({ allowed });
        } catch (error) {
            console.error("Error checking permission:", error);
            return c.json({ 
                allowed: false, 
                error: {
                    code: "INTERNAL_ERROR",
                    message: "An internal error occurred while checking permissions."
                }
            }, 500);
        }
    }
}
