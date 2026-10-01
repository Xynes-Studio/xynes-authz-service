import { createHmac } from "node:crypto";
import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { createInternalRoute } from "../../src/routes/internal/internal.route";
import {
  signedInit,
  gatewayIdentity,
  accountsIdentity,
} from "../support/internal-request";
import { signInternalRequest } from "../../src/infra/security/internal-request";
import { requireInternalServiceAuth } from "../../src/middleware/internal-service-auth";

const tenantA = "00000000-0000-4000-8000-000000000001";
const tenantB = "00000000-0000-4000-8000-000000000002";
const user = "00000000-0000-4000-8000-000000000003";
const path = "/internal/authz-actions";
function init(workspaceId = tenantA) {
  return {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Workspace-Id": workspaceId,
      "X-XS-User-Id": user,
      "X-Request-Id": "root-request",
    },
    body: JSON.stringify({
      actionKey: "authz.assignRole",
      payload: { workspaceId, userId: user, roleKey: "workspace_owner" },
    }),
  };
}
describe("SEC-003 privileged receiver boundary", () => {
  function fixture() {
    const assigned: unknown[] = [];
    let seeds = 0;
    const app = new Hono();
    app.route(
      "/internal",
      createInternalRoute({
        assignRole: async (value) => {
          assigned.push(value);
        },
        ensureAuthzSeeded: async () => {
          seeds++;
        },
      }),
    );
    return { app, assigned, seeds: () => seeds };
  }
  it("accepts accounts identity and retains request id", async () => {
    const { app, assigned } = fixture();
    const response = await app.request(path, signedInit(path, init()));
    expect(response.status).toBe(200);
    expect(assigned).toHaveLength(1);
    expect(await response.json()).toMatchObject({
      meta: { requestId: "root-request" },
    });
  });
  it("rejects gateway assignment before seed/database access", async () => {
    const f = fixture();
    expect(
      (await f.app.request(path, signedInit(path, init(), "gateway"))).status,
    ).toBe(403);
    expect(f.assigned).toHaveLength(0);
    expect(f.seeds()).toBe(0);
  });
  it("rejects static/HS256 credentials even in hybrid mode", async () => {
    const f = fixture();
    process.env.INTERNAL_AUTH_MODE = "hybrid";
    process.env.INTERNAL_SERVICE_TOKEN = "legacy-test-token";
    const key = "shared-sibling-test-key";
    const encode = (value: unknown) =>
      Buffer.from(JSON.stringify(value)).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const input = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ aud: "authz-service", internal: true, iat: now, exp: now + 60, requestId: "forged" })}`;
    const sharedJwt = `${input}.${createHmac("sha256", key).update(input).digest("base64url")}`;
    for (const token of ["legacy-test-token", sharedJwt]) {
      expect(
        (
          await f.app.request(path, {
            ...init(),
            headers: { ...init().headers, "X-Internal-Service-Token": token },
          })
        ).status,
      ).toBe(403);
    }
    expect(f.assigned).toHaveLength(0);
  });
  it("rejects tenant A token transplanted to tenant B owner assignment", async () => {
    const f = fixture();
    const signed = signedInit(path, init());
    expect(
      (await f.app.request(path, { ...signed, body: init(tenantB).body }))
        .status,
    ).toBe(403);
    const headers = new Headers(signed.headers);
    headers.set("X-Workspace-Id", tenantB);
    expect(
      (
        await f.app.request(path, {
          ...signed,
          headers,
          body: init(tenantB).body,
        })
      ).status,
    ).toBe(403);
    expect(f.assigned).toHaveLength(0);
    expect(f.seeds()).toBe(0);
  });
  it("rejects issuer/key confusion and changed action", async () => {
    const f = fixture();
    const raw = init();
    const headers = new Headers(raw.headers);
    headers.set(
      "X-Internal-Service-Token",
      signInternalRequest(
        {
          audience: "authz-service",
          operation: "authz.assignRole",
          url: `http://localhost${path}`,
          method: "POST",
          body: raw.body,
          headers,
        },
        {
          issuer: "accounts",
          keyId: "a1",
          privateKey: gatewayIdentity.privateKey,
        },
      ),
    );
    expect((await f.app.request(path, { ...raw, headers })).status).toBe(403);
    const signed = signedInit(path, raw);
    expect(
      (
        await f.app.request(path, {
          ...signed,
          body: raw.body.replace(
            "authz.assignRole",
            "authz.listRolesForWorkspace",
          ),
        })
      ).status,
    ).toBe(403);
    expect(f.assigned).toHaveLength(0);
  });
  it("bounds streamed bytes despite dishonest content length", async () => {
    const f = fixture();
    const signed = signedInit(path, init());
    const headers = new Headers(signed.headers);
    headers.set("Content-Length", "1");
    const response = await f.app.request(path, {
      ...signed,
      headers,
      body: "x".repeat(32769),
    });
    expect(response.status).toBe(400);
    expect(f.assigned).toHaveLength(0);
  });
  it("fails closed when trust configuration is absent", async () => {
    const saved = process.env.INTERNAL_REQUEST_TRUST_FILE;
    try {
      delete process.env.INTERNAL_REQUEST_TRUST_FILE;
      const f = fixture();
      expect((await f.app.request(path, signedInit(path, init()))).status).toBe(
        500,
      );
      expect(f.assigned).toHaveLength(0);
    } finally {
      process.env.INTERNAL_REQUEST_TRUST_FILE = saved;
    }
  });
  it("compatibility option cannot authenticate legacy tokens on role endpoint", async () => {
    const app = new Hono();
    app.use("*", requireInternalServiceAuth({ allowLegacyReadCheck: true }));
    app.post(path, (c) => c.json({ ok: true }));
    expect(
      (
        await app.request(path, {
          ...init(),
          headers: { "X-Internal-Service-Token": "legacy-test-token" },
        })
      ).status,
    ).toBe(403);
  });
  it("verifies signed read checks from both callers", async () => {
    const app = new Hono();
    app.use("*", requireInternalServiceAuth({ allowLegacyReadCheck: true }));
    app.post("/authz/check", (c) => c.json({ allowed: true }));
    for (const issuer of ["gateway", "accounts"] as const) {
      const request = {
        ...init(),
        body: JSON.stringify({
          userId: user,
          workspaceId: tenantA,
          actionKey: "cms.entry.read",
        }),
      };
      expect(
        (
          await app.request(
            "/authz/check",
            signedInit("/authz/check", request, issuer),
          )
        ).status,
      ).toBe(200);
    }
    expect(accountsIdentity.publicKey.asymmetricKeyType).toBe("ed25519");
  });
});

describe("SEC-003 authenticated action validation and errors", () => {
  function appFor(deps: Parameters<typeof createInternalRoute>[0] = {}) {
    const app = new Hono();
    app.route(
      "/internal",
      createInternalRoute({
        ensureAuthzSeeded: async () => undefined,
        ...deps,
      }),
    );
    return app;
  }
  it("rejects extra envelope fields and invalid role/list payloads without dispatch", async () => {
    const app = appFor({
      assignRole: async () => {
        throw new Error("must not run");
      },
    });
    for (const body of [
      { actionKey: "authz.assignRole", payload: {}, unexpected: true },
      {
        actionKey: "authz.assignRole",
        payload: { workspaceId: tenantA, userId: user, roleKey: "super_admin" },
      },
      {
        actionKey: "authz.listRolesForWorkspace",
        payload: { workspaceId: tenantA, userIds: ["invalid"] },
      },
    ]) {
      const response = await app.request(
        path,
        signedInit(path, { ...init(), body: JSON.stringify(body) }),
      );
      expect(response.status).toBe(400);
    }
  });
  it("keeps database errors redacted for assignment and listing", async () => {
    const app = appFor({
      assignRole: async () => {
        throw new Error("secret database detail");
      },
      listRolesForWorkspace: async () => {
        throw new Error("secret database detail");
      },
    });
    for (const actionKey of [
      "authz.assignRole",
      "authz.listRolesForWorkspace",
    ]) {
      const payload =
        actionKey === "authz.assignRole"
          ? { userId: user, workspaceId: tenantA, roleKey: "workspace_owner" }
          : { workspaceId: tenantA };
      const response = await app.request(
        path,
        signedInit(path, {
          ...init(),
          body: JSON.stringify({ actionKey, payload }),
        }),
      );
      expect(response.status).toBe(500);
      expect(await response.text()).not.toContain("secret database detail");
    }
  });
  it("limits requests with honest Content-Length before authentication", async () => {
    const app = appFor();
    const raw = signedInit(path, init());
    const headers = new Headers(raw.headers);
    headers.set("Content-Length", "32769");
    expect(
      (await app.request(path, { ...raw, headers, body: "x".repeat(32769) }))
        .status,
    ).toBe(400);
  });
});
