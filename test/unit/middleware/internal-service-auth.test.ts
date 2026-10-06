import { describe, it, expect, beforeEach } from "bun:test";
import { Hono } from "hono";
import { signedInit } from "../../support/internal-request";
import { requireInternalServiceAuth } from "../../../src/middleware/internal-service-auth";

type ErrorEnvelope = {
  ok: false;
  error: { code: string; message: string };
  meta: { requestId: string };
};

describe("requireInternalServiceAuth (unit)", () => {
  const token = "unit-test-token";

  beforeEach(() => {
    process.env.INTERNAL_SERVICE_TOKEN = token;
  });

  it("returns 500 when receiver trust is missing", async () => {
    const trust = process.env.INTERNAL_REQUEST_TRUST_FILE;
    delete process.env.INTERNAL_REQUEST_TRUST_FILE;

    const app = new Hono();
    let ran = false;
    app.use("*", requireInternalServiceAuth());
    app.post("/authz/check", (c) => {
      ran = true;
      return c.json({ ok: true });
    });

    const res = await app.request("/authz/check", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Service-Token": token,
      },
      body: JSON.stringify({}),
    });

    process.env.INTERNAL_REQUEST_TRUST_FILE = trust;
    expect(res.status).toBe(500);
    expect(ran).toBe(false);
    const body = (await res.json()) as ErrorEnvelope;
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("INTERNAL_ERROR");
  });

  it("returns 401 when header missing and does not run handler", async () => {
    const app = new Hono();
    let ran = false;
    app.use("*", requireInternalServiceAuth());
    app.post("/authz/check", (c) => {
      ran = true;
      return c.json({ ok: true });
    });

    const res = await app.request("/authz/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(401);
    expect(ran).toBe(false);
  });

  it("returns 403 when header mismatched and does not run handler", async () => {
    const app = new Hono();
    let ran = false;
    app.use("*", requireInternalServiceAuth());
    app.post("/authz/check", (c) => {
      ran = true;
      return c.json({ ok: true });
    });

    const res = await app.request("/authz/check", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Service-Token": "wrong-token",
      },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(403);
    expect(ran).toBe(false);
  });

  it("allows a bound gateway request", async () => {
    const app = new Hono();
    let ran = false;
    app.use("*", requireInternalServiceAuth());
    app.post("/authz/check", (c) => {
      ran = true;
      return c.json({ ok: true });
    });

    const res = await app.request(
      "/authz/check",
      signedInit(
        "/authz/check",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Internal-Service-Token": token,
          },
          body: JSON.stringify({}),
        },
        "gateway",
      ),
    );

    expect(res.status).toBe(200);
    expect(ran).toBe(true);
  });
});
