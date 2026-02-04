import { describe, it, expect, beforeEach } from "bun:test";
import { Hono } from "hono";
import app from "../../src";
import { createInternalRoute } from "../../src/routes/internal/internal.route";

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

  it("handles listRolesForWorkspace action", async () => {
    const internalRoute = createInternalRoute({
      listRolesForWorkspace: async () => [
        { userId: "user-1", roleKey: "workspace_owner" },
      ],
      ensureAuthzSeeded: async () => undefined,
    });
    const testApp = new Hono();
    testApp.route("/internal", internalRoute);

    const res = await testApp.request("/internal/authz-actions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Service-Token": "unit-test-token",
      },
      body: JSON.stringify({
        actionKey: "authz.listRolesForWorkspace",
        payload: { workspaceId: "00000000-0000-0000-0000-000000000000" },
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      data: { roles: unknown[] };
    };
    expect(body.ok).toBe(true);
    expect(body.data.roles).toHaveLength(1);
  });
});
