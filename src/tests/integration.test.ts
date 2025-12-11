import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { db } from "../../src/db";
import { userRoles, roles, permissions, rolePermissions } from "../../src/db/schema";
import { eq } from "drizzle-orm";
import app from "../../src/index";

// Integration test suite
describe("Authz Integration (DB)", () => {
    const TEST_USER_ID = "int-test-user-1";
    const TEST_WORKSPACE_ID = "int-test-work-1";

    beforeAll(async () => {
        // Setup: Ensure super_admin role exists (seeded)
        const superAdmin = await db.query.roles.findFirst({
            where: eq(roles.key, "super_admin")
        });
        
        if (!superAdmin) throw new Error("Super admin role not found");

        // Assign to user
        await db.insert(userRoles).values({
            workspaceId: TEST_WORKSPACE_ID,
            userId: TEST_USER_ID,
            roleId: superAdmin.id
        }).onConflictDoNothing();
    });

    test("POST /authz/check - should return true for super_admin", async () => {
        const res = await app.request("/authz/check", {
            method: "POST",
            body: JSON.stringify({
                userId: TEST_USER_ID,
                workspaceId: TEST_WORKSPACE_ID,
                actionKey: "docs.document.create"
            }),
            headers: new Headers({ "Content-Type": "application/json" }),
        });
        
        expect(res.status).toBe(200);
        const body = await res.json() as { allowed: boolean };
        expect(body.allowed).toBe(true);
    });

    test("POST /authz/check - should return true for role with permission", async () => {
        // Setup: Create a new role 'editor' with permission 'docs.document.read' if not exists
        // (Assuming seed created permissions)
        const EDITOR_ROLE_KEY = "editor";
        
        // Ensure role exists
        const [editorRole] = await db.insert(roles).values({
            key: EDITOR_ROLE_KEY, 
            description: "Editor"
        }).onConflictDoUpdate({ target: roles.key, set: { description: "Editor" } }).returning();

        const roleId = editorRole ? editorRole.id : (await db.query.roles.findFirst({ where: eq(roles.key, EDITOR_ROLE_KEY) }))!.id;

        // Assign permission
        const perm = await db.query.permissions.findFirst({ where: eq(permissions.key, "docs.document.read") });
        if (!perm) throw new Error("Permission docs.document.read not found");

        await db.insert(rolePermissions).values({ roleId, permissionId: perm.id }).onConflictDoNothing();

        // Assign to NEW test user
        const USER_2 = "user-editor";
        await db.insert(userRoles).values({
            workspaceId: TEST_WORKSPACE_ID,
            userId: USER_2,
            roleId
        }).onConflictDoNothing();

        const res = await app.request("/authz/check", {
            method: "POST",
            body: JSON.stringify({
                userId: USER_2,
                workspaceId: TEST_WORKSPACE_ID,
                actionKey: "docs.document.read"
            }),
            headers: new Headers({ "Content-Type": "application/json" }),
        });
        
        expect(res.status).toBe(200);
        const body = await res.json() as { allowed: boolean };
        expect(body.allowed).toBe(true);
    });

    test("POST /authz/check - should return false for unknown user", async () => {
        const res = await app.request("/authz/check", {
            method: "POST",
            body: JSON.stringify({
                userId: "unknown",
                workspaceId: "unknown",
                actionKey: "docs.document.create"
            }),
            headers: new Headers({ "Content-Type": "application/json" }),
        });
        
        expect(res.status).toBe(200);
        const body = await res.json() as { allowed: boolean };
        expect(body.allowed).toBe(false);
    });
});
