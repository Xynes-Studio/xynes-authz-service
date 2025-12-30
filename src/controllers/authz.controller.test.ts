import { describe, expect, test } from "bun:test";
import app from "../index";

describe("POST /authz/check (Controller)", () => {
  test("should return 400 if body is invalid (empty)", async () => {
    const res = await app.request("/authz/check", {
      method: "POST",
      body: JSON.stringify({}),
      headers: new Headers({ "Content-Type": "application/json" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Missing required fields");
  });

  test("should return 400 if userId is missing", async () => {
    const res = await app.request("/authz/check", {
      method: "POST",
      body: JSON.stringify({
        workspaceId: "ws-123",
        actionKey: "docs.document.read",
      }),
      headers: new Headers({ "Content-Type": "application/json" }),
    });
    expect(res.status).toBe(400);
  });

  test("should return 400 if workspaceId is missing", async () => {
    const res = await app.request("/authz/check", {
      method: "POST",
      body: JSON.stringify({
        userId: "user-123",
        actionKey: "docs.document.read",
      }),
      headers: new Headers({ "Content-Type": "application/json" }),
    });
    expect(res.status).toBe(400);
  });

  test("should return 400 if actionKey is missing", async () => {
    const res = await app.request("/authz/check", {
      method: "POST",
      body: JSON.stringify({
        userId: "user-123",
        workspaceId: "ws-123",
      }),
      headers: new Headers({ "Content-Type": "application/json" }),
    });
    expect(res.status).toBe(400);
  });

  test("should return 400 if body is not valid JSON", async () => {
    const res = await app.request("/authz/check", {
      method: "POST",
      body: "not json",
      headers: new Headers({ "Content-Type": "application/json" }),
    });
    expect(res.status).toBe(400);
  });
});
