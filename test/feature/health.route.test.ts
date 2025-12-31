import { describe, expect, test } from "bun:test";
import app from "../../src/index";

describe("GET /health (Feature)", () => {
  test("returns service status", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", service: "xynes-authz-service" });
  });
});

