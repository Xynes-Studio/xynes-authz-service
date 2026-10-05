import "../support/internal-request";
import { afterEach, beforeEach, expect, it } from "bun:test";
import { createHmac } from "node:crypto";
import { Hono } from "hono";
import { requireInternalServiceAuth } from "../../src/middleware/internal-service-auth";

const names = [
  "INTERNAL_AUTH_MODE",
  "INTERNAL_JWT_SIGNING_KEY",
  "INTERNAL_SERVICE_TOKEN",
] as const;
let saved: Array<string | undefined>;
beforeEach(() => {
  saved = names.map((name) => process.env[name]);
  for (const name of names) delete process.env[name];
});
afterEach(() => {
  names.forEach((name, index) => {
    if (saved[index] === undefined) delete process.env[name];
    else process.env[name] = saved[index];
  });
});
function token(payload: Record<string, unknown>, key = "read-check-test-key") {
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  ).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.${createHmac("sha256", key).update(`${header}.${body}`).digest("base64url")}`;
}
function app() {
  const result = new Hono<{ Variables: { requestId: string } }>();
  result.use("*", requireInternalServiceAuth());
  result.all("*", (c) => c.json({ requestId: c.get("requestId") }));
  return result;
}
const validClaims = () => ({
  aud: "authz-service",
  internal: true,
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 60,
  requestId: "legacy-correlation",
});
it("rejects legacy credentials on every internal endpoint", async () => {
  process.env.INTERNAL_SERVICE_TOKEN = "read-only-token";
  for (const [path, method] of [
    ["/authz/check", "GET"],
    ["/internal/authz-actions", "POST"],
  ]) {
    expect(
      (
        await app().request(path, {
          method,
          headers: { "X-Internal-Service-Token": "read-only-token" },
        })
      ).status,
    ).toBe(403);
  }
});
it("requires a bound token regardless of legacy configuration", async () => {
  expect((await app().request("/authz/check", { method: "POST" })).status).toBe(
    401,
  );
  process.env.INTERNAL_AUTH_MODE = "jwt";
  process.env.INTERNAL_SERVICE_TOKEN = "read-only-token";
  expect((await app().request("/authz/check", { method: "POST" })).status).toBe(
    401,
  );
});
it("rejects otherwise valid shared JWT read checks", async () => {
  process.env.INTERNAL_AUTH_MODE = "jwt";
  process.env.INTERNAL_JWT_SIGNING_KEY = "read-check-test-key";
  const response = await app().request("/authz/check", {
    method: "POST",
    headers: { "X-Internal-Service-Token": token(validClaims()) },
  });
  expect(response.status).toBe(403);
});
it("rejects static, expired, wrong-audience and wrong-signature credentials in JWT mode", async () => {
  process.env.INTERNAL_AUTH_MODE = "jwt";
  process.env.INTERNAL_JWT_SIGNING_KEY = "read-check-test-key";
  process.env.INTERNAL_SERVICE_TOKEN = "read-only-token";
  for (const credential of [
    "read-only-token",
    token({ ...validClaims(), exp: 1 }),
    token({ ...validClaims(), aud: "accounts-service" }),
    token(validClaims(), "wrong-key"),
  ]) {
    expect(
      (
        await app().request("/authz/check", {
          method: "POST",
          headers: { "X-Internal-Service-Token": credential },
        })
      ).status,
    ).toBe(403);
  }
});
it("never falls back to the configured hybrid read credential", async () => {
  process.env.INTERNAL_JWT_SIGNING_KEY = "read-check-test-key";
  const invalidJwt = token(validClaims(), "wrong-key");
  process.env.INTERNAL_SERVICE_TOKEN = invalidJwt;
  expect(
    (
      await app().request("/authz/check", {
        method: "POST",
        headers: { "X-Internal-Service-Token": invalidJwt },
      })
    ).status,
  ).toBe(403);
  process.env.INTERNAL_SERVICE_TOKEN = "different-read-token";
  expect(
    (
      await app().request("/authz/check", {
        method: "POST",
        headers: { "X-Internal-Service-Token": invalidJwt },
      })
    ).status,
  ).toBe(403);
});
