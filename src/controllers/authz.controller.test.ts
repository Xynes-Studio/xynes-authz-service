import { describe, expect, test } from "bun:test";
import app from "../index";

describe("POST /authz/check (Controller)", () => {
    test("should return 400 if body is invalid", async () => {
        const res = await app.request("/authz/check", {
            method: "POST",
            body: JSON.stringify({}),
            headers: new Headers({ "Content-Type": "application/json" }),
        });
        expect(res.status).toBe(400);
    });
});
