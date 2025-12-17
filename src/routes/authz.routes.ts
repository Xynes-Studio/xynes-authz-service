import { Hono } from "hono";
import { AuthzController } from "../controllers/authz.controller";
import { requireInternalServiceAuth } from "../middleware/internal-service-auth";

const authzRoutes = new Hono();

authzRoutes.use("*", requireInternalServiceAuth());
authzRoutes.post("/check", AuthzController.check);

export default authzRoutes;
