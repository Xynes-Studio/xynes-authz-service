import { describe, expect, test } from "bun:test";
import { AuthzService } from "../../src/services/authz.service";

describe("AuthzService.resolvePermission (Pure Unit)", () => {
    test("should allow super_admin", () => {
        const allowed = AuthzService.resolvePermission(["super_admin"], {}, "any.action");
        expect(allowed).toBe(true);
    });

    test("should allow workspace_owner for all actions", () => {
        // workspace_owner logic usually relies on having all permissions assigned to it in DB.
        // But if we tested logic where we pass specific permissions map:
        const permissionsMap = {
            "workspace_owner": ["docs.document.create", "docs.document.read"]
        };
        const allowed = AuthzService.resolvePermission(["workspace_owner"], permissionsMap, "docs.document.create");
        expect(allowed).toBe(true);
    });

    test("should allow content_editor for create docs", () => {
        const permissionsMap = {
            "content_editor": ["docs.document.create"]
        };
        const allowed = AuthzService.resolvePermission(["content_editor"], permissionsMap, "docs.document.create");
        expect(allowed).toBe(true);
    });

     test("should allow read_only for read docs", () => {
        const permissionsMap = {
            "read_only": ["docs.document.read"]
        };
        const allowed = AuthzService.resolvePermission(["read_only"], permissionsMap, "docs.document.read");
        expect(allowed).toBe(true);
    });

    test("should deny read_only for create docs", () => {
        const permissionsMap = {
            "read_only": ["docs.document.read"]
        };
        const allowed = AuthzService.resolvePermission(["read_only"], permissionsMap, "docs.document.create");
        expect(allowed).toBe(false);
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
