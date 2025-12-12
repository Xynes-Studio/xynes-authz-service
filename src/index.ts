import { Hono } from "hono";
import { logger } from "hono/logger";
import authzRoutes from "./routes/authz.routes";
import { healthRoute } from "./routes/health.route";
import { readyRoute } from "./routes/ready.route";

const app = new Hono();

app.use("*", logger());

app.route("/", healthRoute);
app.route("/", readyRoute);

app.route("/authz", authzRoutes);

export default app;
