import { describe, expect, test, mock } from "bun:test";
import { AuthzService } from "../services/authz.service";

// Mocking dependencies if possible.
// Bun's test runner can mock modules, but here we can rely on the pure function resolvePermission for high value unit tests.
// And we can integration test the full stack to cover the rest.

describe("AuthzService.resolvePermission (Pure Unit)", () => {
    test("should allow super_admin", () => {
        const allowed = AuthzService.resolvePermission(["super_admin"], {}, "any.action");
        expect(allowed).toBe(true);
    });

    test("should allow if role has permission", () => {
        const allowed = AuthzService.resolvePermission(
            ["editor"], 
            { "editor": ["docs.write"] }, 
            "docs.write"
        );
        expect(allowed).toBe(true);
    });

    test("should deny if role does not have permission", () => {
        const allowed = AuthzService.resolvePermission(
            ["viewer"], 
            { "viewer": ["docs.read"] }, 
            "docs.write"
        );
        expect(allowed).toBe(false);
    });

    test("should deny if no roles", () => {
         const allowed = AuthzService.resolvePermission([], {}, "docs.read");
         expect(allowed).toBe(false);
    });
});
