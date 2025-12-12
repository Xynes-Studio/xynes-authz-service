import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { db } from "../../src/db";
import { userRoles, roles, permissions, rolePermissions } from "../../src/db/schema";
import { eq } from "drizzle-orm";
import app from "../../src/index";

// Integration test suite
describe("Authz Integration (DB)", () => {
    const TEST_USER_ID = "int-test-user-1";
    const TEST_WORKSPACE_ID = "int-test-work-1";

    // Constants for test
    const PERMISSIONS_LIST = [
        { key: "docs.document.create", description: "Create documents" },
        { key: "docs.document.read", description: "Read documents" },
        { key: "cms.blog_entry.create", description: "Create blog entries" },
        { key: "cms.blog_entry.read", description: "Read blog entries" },
    ];

    beforeAll(async () => {
        // Setup: Ensure permissions exist (mini-seed for test)
        await db.insert(permissions).values(PERMISSIONS_LIST).onConflictDoNothing();

        // Setup: Ensure super_admin role exists
        const [superAdminRole] = await db.insert(roles).values({
            key: "super_admin",
            description: "Super Admin",
        }).onConflictDoNothing().returning();
        
        const superAdminId = superAdminRole ? superAdminRole.id : (await db.query.roles.findFirst({ where: eq(roles.key, "super_admin") }))!.id;

        // Assign to user
        await db.insert(userRoles).values({
            workspaceId: TEST_WORKSPACE_ID,
            userId: TEST_USER_ID,
            roleId: superAdminId
        }).onConflictDoNothing();

        // Setup: Ensure other roles exist and have permissions
        // Workspace Owner
        const [ownerRole] = await db.insert(roles).values({ key: "workspace_owner", description: "Owner" }).onConflictDoNothing().returning();
        const ownerId = ownerRole ? ownerRole.id : (await db.query.roles.findFirst({ where: eq(roles.key, "workspace_owner") }))!.id;
        // Assign all permissions to owner (just mapping all from PERMISSIONS_LIST for test simplicity)
        const allPerms = await db.select().from(permissions);
        await db.insert(rolePermissions).values(allPerms.map(p => ({ roleId: ownerId, permissionId: p.id }))).onConflictDoNothing();

        // Content Editor
        const [editorRole] = await db.insert(roles).values({ key: "content_editor", description: "Editor" }).onConflictDoNothing().returning();
        const editorId = editorRole ? editorRole.id : (await db.query.roles.findFirst({ where: eq(roles.key, "content_editor") }))!.id;
        // Assign creation perms
        const createPerm = allPerms.find(p => p.key === "docs.document.create");
        if (createPerm) await db.insert(rolePermissions).values({ roleId: editorId, permissionId: createPerm.id }).onConflictDoNothing();

        // Read Only
        const [readOnlyRole] = await db.insert(roles).values({ key: "read_only", description: "Read Only" }).onConflictDoNothing().returning();
        const readOnlyId = readOnlyRole ? readOnlyRole.id : (await db.query.roles.findFirst({ where: eq(roles.key, "read_only") }))!.id;
         // Assign read perms
        const readPerm = allPerms.find(p => p.key === "docs.document.read");
        if (readPerm) await db.insert(rolePermissions).values({ roleId: readOnlyId, permissionId: readPerm.id }).onConflictDoNothing();

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

    test("POST /authz/check - should allow workspace_owner", async () => {
        const USER_OWNER = "user-owner";
        const ownerId = (await db.query.roles.findFirst({ where: eq(roles.key, "workspace_owner") }))!.id;
        await db.insert(userRoles).values({ workspaceId: TEST_WORKSPACE_ID, userId: USER_OWNER, roleId: ownerId }).onConflictDoNothing();

        const res = await app.request("/authz/check", {
            method: "POST",
            body: JSON.stringify({ userId: USER_OWNER, workspaceId: TEST_WORKSPACE_ID, actionKey: "docs.document.create" }),
            headers: new Headers({ "Content-Type": "application/json" }),
        });
        expect((await res.json() as { allowed: boolean }).allowed).toBe(true);
    });

     test("POST /authz/check - should allow content_editor to create", async () => {
        const USER_EDITOR = "user-editor-2";
        const editorId = (await db.query.roles.findFirst({ where: eq(roles.key, "content_editor") }))!.id;
        await db.insert(userRoles).values({ workspaceId: TEST_WORKSPACE_ID, userId: USER_EDITOR, roleId: editorId }).onConflictDoNothing();

        const res = await app.request("/authz/check", {
            method: "POST",
            body: JSON.stringify({ userId: USER_EDITOR, workspaceId: TEST_WORKSPACE_ID, actionKey: "docs.document.create" }),
            headers: new Headers({ "Content-Type": "application/json" }),
        });
        expect((await res.json() as { allowed: boolean }).allowed).toBe(true);
    });

    test("POST /authz/check - should allow read_only to read but NOT create", async () => {
        const USER_READONLY = "user-readonly";
        const roId = (await db.query.roles.findFirst({ where: eq(roles.key, "read_only") }))!.id;
        await db.insert(userRoles).values({ workspaceId: TEST_WORKSPACE_ID, userId: USER_READONLY, roleId: roId }).onConflictDoNothing();

        // Read (Allowed)
        const resRead = await app.request("/authz/check", {
            method: "POST",
            body: JSON.stringify({ userId: USER_READONLY, workspaceId: TEST_WORKSPACE_ID, actionKey: "docs.document.read" }),
            headers: new Headers({ "Content-Type": "application/json" }),
        });
        expect((await resRead.json() as { allowed: boolean }).allowed).toBe(true);

        // Create (Denied)
        const resCreate = await app.request("/authz/check", {
            method: "POST",
            body: JSON.stringify({ userId: USER_READONLY, workspaceId: TEST_WORKSPACE_ID, actionKey: "docs.document.create" }),
            headers: new Headers({ "Content-Type": "application/json" }),
        });
        expect((await resCreate.json() as { allowed: boolean }).allowed).toBe(false);
    });

    test("POST /authz/check - should return true for role with permission (legacy test)", async () => {
        // Setup: Create a new role 'editor' with permission 'docs.document.read' if not exists
        // (Assuming seed created permissions)
        const EDITOR_ROLE_KEY = "editor_legacy";
        
        // Ensure role exists
        const [editorRole] = await db.insert(roles).values({
            key: EDITOR_ROLE_KEY, 
            description: "Editor Legacy"
        }).onConflictDoUpdate({ target: roles.key, set: { description: "Editor Legacy" } }).returning();

        const roleId = editorRole ? editorRole.id : (await db.query.roles.findFirst({ where: eq(roles.key, EDITOR_ROLE_KEY) }))!.id;

        // Assign permission
        const perm = await db.query.permissions.findFirst({ where: eq(permissions.key, "docs.document.read") });
        if (!perm) throw new Error("Permission docs.document.read not found");

        await db.insert(rolePermissions).values({ roleId, permissionId: perm.id }).onConflictDoNothing();

        // Assign to NEW test user
        const USER_2 = "user-editor-legacy";
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
    test("POST /authz/check - should return 400 for missing fields", async () => {
        const res = await app.request("/authz/check", {
            method: "POST",
            body: JSON.stringify({}),
            headers: new Headers({ "Content-Type": "application/json" }),
        });
        expect(res.status).toBe(400);
    });

    test("GET /health should return status ok", async () => {
        const res = await app.request("/health");
        expect(res.status).toBe(200);
        const body = await res.json() as { status: string };
        expect(body.status).toBe("ok");
    });
});

