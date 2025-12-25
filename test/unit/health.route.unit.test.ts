import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { healthRoute } from "../../src/routes/health.route";

describe("Health Endpoint (unit)", () => {
  test("GET /health returns 200", async () => {
    const app = new Hono();
    app.route("/", healthRoute);

    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: "ok",
      service: "xynes-authz-service",
    });
  });
});
