import { Hono } from "hono";
import { createGetHealth, getHealth, type HealthControllerDeps } from "../controllers/health.controller";

/**
 * Build a `/health` sub-app with custom dependencies. Production callers
 * should use the default singleton `healthRoute` exported below; tests
 * use this factory to inject a stubbed DB probe / clock / version.
 */
export function createHealthRoute(deps: HealthControllerDeps = {}) {
    const route = new Hono();
    route.get("/health", createGetHealth(deps));
    return route;
}

/** Default singleton wired against the production controller. */
export const healthRoute = new Hono();
healthRoute.get("/health", getHealth);

