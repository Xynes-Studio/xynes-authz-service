import { describe, expect, test, spyOn } from "bun:test";
import app from "../../src/index";
import { AuthzService } from "../../src/services/authz.service";

describe("POST /authz/check (Controller)", () => {
    test("should return 400 if body is invalid", async () => {
        const res = await app.request("/authz/check", {
            method: "POST",
            body: JSON.stringify({}),
            headers: new Headers({ "Content-Type": "application/json" }),
        });
        expect(res.status).toBe(400);
    });

    test("should return 200 { allowed: true } when service returns true", async () => {
        const checkSpy = spyOn(AuthzService, "checkPermission").mockResolvedValue(true);

        const res = await app.request("/authz/check", {
            method: "POST",
            body: JSON.stringify({
                userId: "u1",
                workspaceId: "w1",
                actionKey: "a1"
            }),
            headers: new Headers({ "Content-Type": "application/json" }),
        });

        expect(res.status).toBe(200);
        const body = await res.json() as any;
        expect(body.ok).toBe(true);
        expect(body.data.allowed).toBe(true);
        expect(checkSpy).toHaveBeenCalledWith("u1", "w1", "a1");
        checkSpy.mockRestore();
    });

    test("should return 200 { allowed: false } when service returns false", async () => {
        const checkSpy = spyOn(AuthzService, "checkPermission").mockResolvedValue(false);

        const res = await app.request("/authz/check", {
            method: "POST",
            body: JSON.stringify({
                userId: "u1",
                workspaceId: "w1",
                actionKey: "a1"
            }),
            headers: new Headers({ "Content-Type": "application/json" }),
        });

        expect(res.status).toBe(200);
        const body = await res.json() as any;
        expect(body.ok).toBe(true);
        expect(body.data.allowed).toBe(false);
        checkSpy.mockRestore();
    });

    test("should return 500 when service throws", async () => {
        const checkSpy = spyOn(AuthzService, "checkPermission").mockRejectedValue(new Error("DB Boom"));

        const res = await app.request("/authz/check", {
            method: "POST",
            body: JSON.stringify({
                userId: "u1",
                workspaceId: "w1",
                actionKey: "a1"
            }),
            headers: new Headers({ "Content-Type": "application/json" }),
        });

        expect(res.status).toBe(500);
        const body = await res.json() as any;
        expect(body.error.code).toBe("INTERNAL_ERROR");
        checkSpy.mockRestore();
    });
});
