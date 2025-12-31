import { describe, it, expect, beforeEach } from "bun:test";
import app from "../../src";

describe("Internal Authz Actions (unit)", () => {
  beforeEach(() => {
    process.env.INTERNAL_SERVICE_TOKEN = "unit-test-token";
  });

  it("rejects missing internal auth token", async () => {
    const res = await app.request("/internal/authz-actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actionKey: "authz.assignRole", payload: {} }),
    });

    expect(res.status).toBe(401);
  });

  it("rejects invalid payload", async () => {
    const res = await app.request("/internal/authz-actions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Service-Token": "unit-test-token",
      },
      body: JSON.stringify({
        actionKey: "authz.assignRole",
        payload: { roleKey: "workspace_owner" },
      }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(false);
  });
});
