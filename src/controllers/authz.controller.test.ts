import { describe, expect, test } from "bun:test";
import app from "../index";
import { INTERNAL_SERVICE_TOKEN } from "../test/support/internal-auth";

describe("POST /authz/check (Controller)", () => {
  const authHeaders = new Headers({
    "Content-Type": "application/json",
    "X-Internal-Service-Token": INTERNAL_SERVICE_TOKEN,
  });

  test("should return 400 if body is invalid (empty)", async () => {
    const res = await app.request("/authz/check", {
      method: "POST",
      body: JSON.stringify({}),
      headers: authHeaders,
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error: { code: string } };
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("should return 400 if userId is missing", async () => {
    const res = await app.request("/authz/check", {
      method: "POST",
      body: JSON.stringify({
        workspaceId: "00000000-0000-0000-0000-000000000001",
        actionKey: "docs.document.read",
      }),
      headers: authHeaders,
    });
    expect(res.status).toBe(400);
  });

  test("should return 400 if workspaceId is missing (and not null)", async () => {
    const res = await app.request("/authz/check", {
      method: "POST",
      body: JSON.stringify({
        userId: "00000000-0000-0000-0000-000000000001",
        actionKey: "docs.document.read",
      }),
      headers: authHeaders,
    });
    expect(res.status).toBe(400);
  });

  test("should return 400 if actionKey is missing", async () => {
    const res = await app.request("/authz/check", {
      method: "POST",
      body: JSON.stringify({
        userId: "00000000-0000-0000-0000-000000000001",
        workspaceId: "00000000-0000-0000-0000-000000000002",
      }),
      headers: authHeaders,
    });
    expect(res.status).toBe(400);
  });

  test("should return 400 if body is not valid JSON", async () => {
    const res = await app.request("/authz/check", {
      method: "POST",
      body: "not json",
      headers: authHeaders,
    });
    expect(res.status).toBe(400);
  });
});
