import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { authzCheck } from "../controllers/authz.controller";
import { AUTHZ_CHECK_MAX_BODY_BYTES } from "../config/http";
import { createErrorResponse, getOrCreateRequestId } from "../lib/api-error";
import { requireInternalServiceAuth } from "../middleware/internal-service-auth";

const authzRoutes = new Hono();

authzRoutes.use(
  "/check",
  bodyLimit({
    maxSize: AUTHZ_CHECK_MAX_BODY_BYTES,
    onError: (c) => {
      const requestId = getOrCreateRequestId(c);
      return c.json(createErrorResponse("VALIDATION_ERROR", "Request body too large", requestId), 400);
    },
  })
);
authzRoutes.use("*", requireInternalServiceAuth());
authzRoutes.post("/check", authzCheck);

export default authzRoutes;
