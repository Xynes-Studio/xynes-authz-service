import { describe, expect, test } from "bun:test";
import app from "../../src/index";

describe("GET /health (Feature)", () => {
  test("returns the H-3 contract shape (HEALTHCHECK-CONTRACT.md §2)", async () => {
    // Feature-level smoke against the wired-up app singleton. The
    // contract surface is asserted exhaustively in the unit suite
    // (test/unit/health.route.unit.test.ts). Here we only need to
    // prove the route is mounted, returns JSON, and carries the
    // declared shape — regardless of whether the test environment
    // has a live Postgres (the status will be 503 + ok=false +
    // checks.db="fail" when DB is unreachable, 200 + ok=true +
    // checks.db="ok" when it is).
    const res = await app.request("/health");
    expect([200, 503]).toContain(res.status);
    expect(res.headers.get("content-type")).toMatch(/application\/json/i);

    const body = (await res.json()) as {
      ok: boolean;
      service: string;
      version: string;
      uptime_seconds: number;
      checks: { db: string };
    };

    // Identity fields are environment-independent.
    expect(body.service).toBe("xynes-authz-service");
    expect(typeof body.version).toBe("string");
    expect(typeof body.uptime_seconds).toBe("number");
    expect(Number.isInteger(body.uptime_seconds)).toBe(true);
    expect(body.uptime_seconds).toBeGreaterThanOrEqual(0);

    // Status fields must match the closed-set contract.
    expect(typeof body.ok).toBe("boolean");
    expect(["ok", "fail", "skipped"]).toContain(body.checks.db);
    expect(Object.keys(body.checks).sort()).toEqual(["db"]);

    // Status / ok must be internally consistent.
    if (body.checks.db === "fail") {
      expect(body.ok).toBe(false);
      expect(res.status).toBe(503);
    } else {
      expect(body.ok).toBe(true);
      expect(res.status).toBe(200);
    }
  });
});

