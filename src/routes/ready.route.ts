import { Hono } from "hono";
import { checkPostgresReadiness } from "../infra/readiness";

export type ReadyRouteDependencies = {
    getDatabaseUrl?: () => string;
    check?: typeof checkPostgresReadiness;
    schemaName?: string;
};

export function createReadyRoute({
    getDatabaseUrl = () => {
        const databaseUrl = process.env.DATABASE_URL;
        if (!databaseUrl) {
            throw new Error("DATABASE_URL environment variable is not set");
        }
        return databaseUrl;
    },
    check = checkPostgresReadiness,
    schemaName = "public",
}: ReadyRouteDependencies = {}) {
    const readyRoute = new Hono();

    readyRoute.get("/ready", async (c) => {
        try {
            const databaseUrl = getDatabaseUrl();
            await check({ databaseUrl, schemaName });
            return c.json({ status: "ready" }, 200);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return c.json({ status: "not_ready", error: message }, 503);
        }
    });

    return readyRoute;
}

export const readyRoute = createReadyRoute();
