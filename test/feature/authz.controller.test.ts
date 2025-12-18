import { describe, expect, test, spyOn } from "bun:test";
import app from "../../src/index";
import * as authzService from "../../src/services/authz.service";
import { INTERNAL_SERVICE_TOKEN } from "../support/internal-auth";
import { randomUUID } from "node:crypto";

type ErrorEnvelope = {
    ok: false;
    error: { code: string; message: string };
    meta: { requestId: string };
};
type SuccessEnvelope = {
    ok: true;
    data: { allowed: boolean };
    meta: { requestId: string };
};

describe("POST /authz/check (Controller)", () => {
    test("should return 400 if body is invalid", async () => {
        const res = await app.request("/authz/check", {
            method: "POST",
            body: JSON.stringify({}),
            headers: new Headers({
                "Content-Type": "application/json",
                "X-Internal-Service-Token": INTERNAL_SERVICE_TOKEN,
            }),
        });
        expect(res.status).toBe(400);
    });

    test("should return 400 if userId is not a uuid", async () => {
        const res = await app.request("/authz/check", {
            method: "POST",
            body: JSON.stringify({
                userId: "not-a-uuid",
                workspaceId: randomUUID(),
                actionKey: "docs.document.read",
            }),
            headers: new Headers({
                "Content-Type": "application/json",
                "X-Internal-Service-Token": INTERNAL_SERVICE_TOKEN,
            }),
        });
        expect(res.status).toBe(400);
        const body = (await res.json()) as ErrorEnvelope;
        expect(body.ok).toBe(false);
        expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    test("should return 400 if actionKey is empty", async () => {
        const res = await app.request("/authz/check", {
            method: "POST",
            body: JSON.stringify({
                userId: randomUUID(),
                workspaceId: randomUUID(),
                actionKey: "",
            }),
            headers: new Headers({
                "Content-Type": "application/json",
                "X-Internal-Service-Token": INTERNAL_SERVICE_TOKEN,
            }),
        });
        expect(res.status).toBe(400);
        const body = (await res.json()) as ErrorEnvelope;
        expect(body.ok).toBe(false);
        expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    test("should return 400 if body includes extra fields (strict schema)", async () => {
        const res = await app.request("/authz/check", {
            method: "POST",
            body: JSON.stringify({
                userId: randomUUID(),
                workspaceId: randomUUID(),
                actionKey: "docs.document.read",
                extra: "nope",
            }),
            headers: new Headers({
                "Content-Type": "application/json",
                "X-Internal-Service-Token": INTERNAL_SERVICE_TOKEN,
            }),
        });
        expect(res.status).toBe(400);
        const body = (await res.json()) as ErrorEnvelope;
        expect(body.ok).toBe(false);
        expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    test("should return 400 if body is oversized", async () => {
        const checkSpy = spyOn(authzService, "checkPermission").mockResolvedValue(true);
        const payload = JSON.stringify({
            userId: randomUUID(),
            workspaceId: randomUUID(),
            actionKey: "docs.document.read",
        }) + " ".repeat(20_000);
        const res = await app.request("/authz/check", {
            method: "POST",
            body: payload,
            headers: new Headers({
                "Content-Type": "application/json",
                "X-Internal-Service-Token": INTERNAL_SERVICE_TOKEN,
            }),
        });
        expect(res.status).toBe(400);
        const body = (await res.json()) as ErrorEnvelope;
        expect(body.ok).toBe(false);
        expect(body.error.code).toBe("VALIDATION_ERROR");
        expect(body.error.message).toBe("Request body too large");
        expect(checkSpy).toHaveBeenCalledTimes(0);
        checkSpy.mockRestore();
    });

    test("should return 401 when X-Internal-Service-Token is missing", async () => {
        const res = await app.request("/authz/check", {
            method: "POST",
            body: JSON.stringify({
                userId: randomUUID(),
                workspaceId: randomUUID(),
                actionKey: "docs.document.read"
            }),
            headers: new Headers({ "Content-Type": "application/json" }),
        });
        expect(res.status).toBe(401);
        const body = (await res.json()) as ErrorEnvelope;
        expect(body.ok).toBe(false);
        expect(body.error.code).toBe("UNAUTHORIZED");
    });

    test("should return 403 when X-Internal-Service-Token is mismatched", async () => {
        const res = await app.request("/authz/check", {
            method: "POST",
            body: JSON.stringify({
                userId: randomUUID(),
                workspaceId: randomUUID(),
                actionKey: "docs.document.read"
            }),
            headers: new Headers({
                "Content-Type": "application/json",
                "X-Internal-Service-Token": "wrong-token",
            }),
        });
        expect(res.status).toBe(403);
        const body = (await res.json()) as ErrorEnvelope;
        expect(body.ok).toBe(false);
        expect(body.error.code).toBe("FORBIDDEN");
    });

    test("should return 200 { allowed: true } when service returns true", async () => {
        const checkSpy = spyOn(authzService, "checkPermission").mockResolvedValue(true);

        const userId = randomUUID();
        const workspaceId = randomUUID();
        const actionKey = "docs.document.read";

        const res = await app.request("/authz/check", {
            method: "POST",
            body: JSON.stringify({
                userId,
                workspaceId,
                actionKey
            }),
            headers: new Headers({
                "Content-Type": "application/json",
                "X-Internal-Service-Token": INTERNAL_SERVICE_TOKEN,
            }),
        });

        expect(res.status).toBe(200);
        const body = (await res.json()) as SuccessEnvelope;
        expect(body.ok).toBe(true);
        expect(body.data.allowed).toBe(true);
        expect(checkSpy).toHaveBeenCalledWith(userId, workspaceId, actionKey);
        checkSpy.mockRestore();
    });

    test("should return 200 { allowed: false } when service returns false", async () => {
        const checkSpy = spyOn(authzService, "checkPermission").mockResolvedValue(false);

        const userId = randomUUID();
        const workspaceId = randomUUID();
        const actionKey = "docs.document.read";

        const res = await app.request("/authz/check", {
            method: "POST",
            body: JSON.stringify({
                userId,
                workspaceId,
                actionKey
            }),
            headers: new Headers({
                "Content-Type": "application/json",
                "X-Internal-Service-Token": INTERNAL_SERVICE_TOKEN,
            }),
        });

        expect(res.status).toBe(200);
        const body = (await res.json()) as SuccessEnvelope;
        expect(body.ok).toBe(true);
        expect(body.data.allowed).toBe(false);
        checkSpy.mockRestore();
    });

    test("should return 500 when service throws", async () => {
        const checkSpy = spyOn(authzService, "checkPermission").mockRejectedValue(new Error("DB Boom"));

        const userId = randomUUID();
        const workspaceId = randomUUID();
        const actionKey = "docs.document.read";

        const res = await app.request("/authz/check", {
            method: "POST",
            body: JSON.stringify({
                userId,
                workspaceId,
                actionKey
            }),
            headers: new Headers({
                "Content-Type": "application/json",
                "X-Internal-Service-Token": INTERNAL_SERVICE_TOKEN,
            }),
        });

        expect(res.status).toBe(500);
        const body = (await res.json()) as ErrorEnvelope;
        expect(body.error.code).toBe("INTERNAL_ERROR");
        checkSpy.mockRestore();
    });
});
