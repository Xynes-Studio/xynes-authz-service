import { Hono } from "hono";
import { logger } from "hono/logger";
import authzRoutes from "./routes/authz.routes";

const app = new Hono();

app.use("*", logger());

app.get("/health", (c) => c.json({ status: "ok" }));

app.route("/authz", authzRoutes);

export default app;
