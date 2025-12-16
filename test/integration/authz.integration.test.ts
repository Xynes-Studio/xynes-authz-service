import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { db } from "../../src/db";
import { userRoles, roles, permissions, rolePermissions } from "../../src/db/schema";
import { eq, inArray } from "drizzle-orm";
import app from "../../src/index";
import { Hono } from "hono";
import { createReadyRoute } from "../../src/routes/ready.route";
import { seedAuthz } from "../../src/db/seed/authz.seed";

// Integration test suite
describe("Authz Integration (DB)", () => {
    const TEST_WORKSPACE_ID = `int-test-work-${Date.now()}`;
    const TEST_USER_ID = `int-test-user-${Date.now()}`;

    const LEGACY_ROLE_KEY = `editor_legacy_${Date.now()}`;
    let legacyRoleId: string | null = null;

    beforeAll(async () => {
        await seedAuthz({ db });

        const seededRoles = await db
            .select({ id: roles.id, key: roles.key })
            .from(roles)
            .where(inArray(roles.key, ["super_admin", "workspace_owner", "content_editor", "read_only"]));
        const roleIdByKey = new Map(seededRoles.map((r) => [r.key, r.id]));

        const superAdminId = roleIdByKey.get("super_admin");
        if (!superAdminId) throw new Error("Expected super_admin role to be seeded");

        await db.insert(userRoles).values({
            workspaceId: TEST_WORKSPACE_ID,
            userId: TEST_USER_ID,
            roleId: superAdminId,
        }).onConflictDoNothing();
    }, 15_000);

    afterAll(async () => {
        await db.delete(userRoles).where(eq(userRoles.workspaceId, TEST_WORKSPACE_ID));
        if (legacyRoleId) {
            await db.delete(rolePermissions).where(eq(rolePermissions.roleId, legacyRoleId));
            await db.delete(roles).where(eq(roles.id, legacyRoleId));
        }
    }, 15_000);

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
        const body = await res.json() as any;
        expect(body.ok).toBe(true);
        expect(body.data.allowed).toBe(true);
    }, 15_000);

    test("POST /authz/check - should allow workspace_owner", async () => {
        const USER_OWNER = `user-owner-${Date.now()}`;
        const ownerId = (await db.query.roles.findFirst({ where: eq(roles.key, "workspace_owner") }))!.id;
        await db.insert(userRoles).values({ workspaceId: TEST_WORKSPACE_ID, userId: USER_OWNER, roleId: ownerId }).onConflictDoNothing();

        const res = await app.request("/authz/check", {
            method: "POST",
            body: JSON.stringify({ userId: USER_OWNER, workspaceId: TEST_WORKSPACE_ID, actionKey: "docs.document.create" }),
            headers: new Headers({ "Content-Type": "application/json" }),
        });
        const body = await res.json() as any;
        expect(body.ok).toBe(true);
        expect(body.data.allowed).toBe(true);
    }, 15_000);

     test("POST /authz/check - should allow content_editor to create", async () => {
        const USER_EDITOR = `user-editor-${Date.now()}`;
        const editorId = (await db.query.roles.findFirst({ where: eq(roles.key, "content_editor") }))!.id;
        await db.insert(userRoles).values({ workspaceId: TEST_WORKSPACE_ID, userId: USER_EDITOR, roleId: editorId }).onConflictDoNothing();

        const res = await app.request("/authz/check", {
            method: "POST",
            body: JSON.stringify({ userId: USER_EDITOR, workspaceId: TEST_WORKSPACE_ID, actionKey: "docs.document.create" }),
            headers: new Headers({ "Content-Type": "application/json" }),
        });
        const body = await res.json() as any;
        expect(body.ok).toBe(true);
        expect(body.data.allowed).toBe(true);
    }, 15_000);

    test("POST /authz/check - should allow read_only to read but NOT create", async () => {
        const USER_READONLY = `user-readonly-${Date.now()}`;
        const roId = (await db.query.roles.findFirst({ where: eq(roles.key, "read_only") }))!.id;
        await db.insert(userRoles).values({ workspaceId: TEST_WORKSPACE_ID, userId: USER_READONLY, roleId: roId }).onConflictDoNothing();

        // Read (Allowed)
        const resRead = await app.request("/authz/check", {
            method: "POST",
            body: JSON.stringify({ userId: USER_READONLY, workspaceId: TEST_WORKSPACE_ID, actionKey: "docs.document.read" }),
            headers: new Headers({ "Content-Type": "application/json" }),
        });
        const bodyRead = await resRead.json() as any;
        expect(bodyRead.ok).toBe(true);
        expect(bodyRead.data.allowed).toBe(true);

        // Create (Denied)
        const resCreate = await app.request("/authz/check", {
            method: "POST",
            body: JSON.stringify({ userId: USER_READONLY, workspaceId: TEST_WORKSPACE_ID, actionKey: "docs.document.create" }),
            headers: new Headers({ "Content-Type": "application/json" }),
        });
        const bodyCreate = await resCreate.json() as any;
        expect(bodyCreate.ok).toBe(true);
        expect(bodyCreate.data.allowed).toBe(false);
    }, 15_000);

    test("POST /authz/check - should return true for role with permission (legacy test)", async () => {
        // Setup: Create a new role 'editor' with permission 'docs.document.read' if not exists
        // (Assuming seed created permissions)
        const EDITOR_ROLE_KEY = LEGACY_ROLE_KEY;
        
        // Ensure role exists
        const [editorRole] = await db.insert(roles).values({
            key: EDITOR_ROLE_KEY, 
            description: "Editor Legacy"
        }).onConflictDoUpdate({ target: roles.key, set: { description: "Editor Legacy" } }).returning();

        const roleId = editorRole ? editorRole.id : (await db.query.roles.findFirst({ where: eq(roles.key, EDITOR_ROLE_KEY) }))!.id;
        legacyRoleId = roleId;

        // Assign permission
        const perm = await db.query.permissions.findFirst({ where: eq(permissions.key, "docs.document.read") });
        if (!perm) throw new Error("Permission docs.document.read not found");

        await db.insert(rolePermissions).values({ roleId, permissionId: perm.id }).onConflictDoNothing();

        // Assign to NEW test user
        const USER_2 = `user-editor-legacy-${Date.now()}`;
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
        const body = await res.json() as any;
        expect(body.ok).toBe(true);
        expect(body.data.allowed).toBe(true);
    }, 15_000);

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
        const body = await res.json() as any;
        expect(body.ok).toBe(true);
        expect(body.data.allowed).toBe(false);
    }, 15_000);
    test("POST /authz/check - should return 400 for missing fields", async () => {
        const res = await app.request("/authz/check", {
            method: "POST",
            body: JSON.stringify({}),
            headers: new Headers({ "Content-Type": "application/json" }),
        });
        expect(res.status).toBe(400);
    }, 15_000);

    test("GET /health should return status ok", async () => {
        const res = await app.request("/health");
        expect(res.status).toBe(200);
        const body = await res.json() as any;
        expect(body).toEqual({ status: "ok", service: "xynes-authz-service" });
    }, 15_000);

    test("GET /ready should return status ready when db reachable", async () => {
        const res = await app.request("/ready");
        expect(res.status).toBe(200);
        const body = await res.json() as any;
        expect(body).toEqual({ status: "ready" });
    }, 15_000);

    test("Ready should return 503 for invalid database url", async () => {
        const databaseUrl = process.env.DATABASE_URL;
        if (!databaseUrl) throw new Error("DATABASE_URL is required for this test");

        const invalidUrl = (() => {
            const url = new URL(databaseUrl);
            url.hostname = "127.0.0.1";
            url.port = "1";
            return url.toString();
        })();

        const failingApp = new Hono();
        failingApp.route("/", createReadyRoute({ getDatabaseUrl: () => invalidUrl }));
        const failingRes = await failingApp.request("/ready");
        expect(failingRes.status).toBe(503);
    }, 15_000);
});
