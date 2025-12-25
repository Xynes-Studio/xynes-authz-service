import { describe, expect, test, afterEach } from "bun:test";
import { Hono } from "hono";
import { createReadyRoute } from "../../src/routes/ready.route";

describe("Ready Endpoint defaults (unit)", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  test("GET /ready returns 503 when DATABASE_URL is missing (default getDatabaseUrl)", async () => {
    delete process.env.DATABASE_URL;

    const check = () => {
      throw new Error("check should not be called");
    };

    const app = new Hono();
    app.route("/", createReadyRoute({ check }));

    const res = await app.request("/ready");
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      status: "not_ready",
      error: "DATABASE_URL environment variable is not set",
    });
  });

  test("GET /ready uses DATABASE_URL env when present (default getDatabaseUrl)", async () => {
    process.env.DATABASE_URL = "postgres://unused";

    let called = false;
    const check = async ({ databaseUrl }: { databaseUrl: string; schemaName?: string }) => {
      called = true;
      expect(databaseUrl).toBe("postgres://unused");
    };

    const app = new Hono();
    app.route("/", createReadyRoute({ check }));

    const res = await app.request("/ready");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ready" });
    expect(called).toBe(true);
  });
});
