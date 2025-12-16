import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { createReadyRoute } from "../../src/routes/ready.route";

describe("createReadyRoute (Unit)", () => {
  test("returns 503 when DATABASE_URL is missing", async () => {
    const prev = process.env.DATABASE_URL;
    // biome-ignore lint/performance/noDelete: test needs to simulate missing env
    delete process.env.DATABASE_URL;

    try {
      const app = new Hono();
      app.route("/", createReadyRoute());
      const res = await app.request("/ready");
      expect(res.status).toBe(503);
      const body = (await res.json()) as any;
      expect(body.status).toBe("not_ready");
      expect(body.error).toContain("DATABASE_URL environment variable is not set");
    } finally {
      if (prev !== undefined) process.env.DATABASE_URL = prev;
    }
  });
});

