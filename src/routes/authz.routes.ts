import { Hono } from "hono";
import { AuthzController } from "../controllers/authz.controller";

const authzRoutes = new Hono();

authzRoutes.post("/check", AuthzController.check);

export default authzRoutes;
