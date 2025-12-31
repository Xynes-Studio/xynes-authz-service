import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import {
  permissions,
  roles,
  rolePermissions,
  userRoles,
} from "../../src/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import app from "../../src/index";
import { seedAuthz } from "../../src/db/seed/authz.seed";
import { INTERNAL_SERVICE_TOKEN } from "../support/internal-auth";
import { randomUUID } from "node:crypto";

describe.skipIf(process.env.RUN_INTEGRATION_TESTS !== "true")(
  "Authz seed + /authz/check (New actions)",
  () => {
    type CheckSuccess = { ok: true; data: { allowed: boolean } };
    let db: typeof import("../../src/db")["db"];
    const workspaceId = randomUUID();
    const ownerUserId = randomUUID();
    const editorUserId = randomUUID();
    const readOnlyUserId = randomUUID();

    const updateActions = [
      "docs.document.update",
      "cms.blog_entry.updateMeta",
      "cms.content.create",
    ] as const;
    const readOnlyListActions = [
      "docs.document.listByWorkspace",
      "cms.content.listPublished",
      "cms.content.getPublishedBySlug",
      "cms.templates.listGlobal",
      "cms.content_types.listForWorkspace",
    ] as const;
    const adminListActions = ["cms.blog_entry.listAdmin"] as const;

    beforeAll(async () => {
      ({ db } = await import("../../src/db"));
      await seedAuthz({ db });
      await seedAuthz({ db }); // idempotency

      const roleRows = await db
        .select()
        .from(roles)
        .where(
          inArray(roles.key, ["workspace_owner", "content_editor", "read_only"])
        );
      const roleIdByKey = new Map(roleRows.map((r) => [r.key, r.id]));

      const ownerRoleId = roleIdByKey.get("workspace_owner");
      const editorRoleId = roleIdByKey.get("content_editor");
      const readOnlyRoleId = roleIdByKey.get("read_only");
      if (!ownerRoleId || !editorRoleId || !readOnlyRoleId)
        throw new Error("Expected roles to be seeded");

      await db
        .insert(userRoles)
        .values({
          workspaceId,
          userId: ownerUserId,
          roleKey: "workspace_owner",
        })
        .onConflictDoNothing();
      await db
        .insert(userRoles)
        .values({
          workspaceId,
          userId: editorUserId,
          roleKey: "content_editor",
        })
        .onConflictDoNothing();
      await db
        .insert(userRoles)
        .values({ workspaceId, userId: readOnlyUserId, roleKey: "read_only" })
        .onConflictDoNothing();
    });

    afterAll(async () => {
      await db.delete(userRoles).where(eq(userRoles.workspaceId, workspaceId));
    }, 15_000);

    test("seed inserts new permissions", async () => {
      const keys = [
        ...updateActions,
        ...readOnlyListActions,
        ...adminListActions,
      ];
      const rows = await db
        .select()
        .from(permissions)
        .where(inArray(permissions.key, keys));
      expect(rows.map((r) => r.key).sort()).toEqual([...keys].sort());
    });

    test("seed maps new permissions to roles", async () => {
      const roleRows = await db
        .select()
        .from(roles)
        .where(
          inArray(roles.key, ["workspace_owner", "content_editor", "read_only"])
        );
      const roleIdByKey = new Map(roleRows.map((r) => [r.key, r.id]));

      const permRows = await db
        .select()
        .from(permissions)
        .where(
          inArray(permissions.key, [
            ...updateActions,
            ...readOnlyListActions,
            ...adminListActions,
          ])
        );
      const permIdByKey = new Map(permRows.map((p) => [p.key, p.id]));

      const roleIds = roleRows.map((r) => r.id);
      const permIds = permRows.map((p) => p.id);

      const rolePermissionRows = await db
        .select()
        .from(rolePermissions)
        .where(
          and(
            inArray(rolePermissions.roleId, roleIds),
            inArray(rolePermissions.permissionId, permIds)
          )
        );
      const hasMapping = (roleKey: string, permissionKey: string) => {
        const roleId = roleIdByKey.get(roleKey);
        const permissionId = permIdByKey.get(permissionKey);
        if (!roleId || !permissionId) return false;
        return rolePermissionRows.some(
          (rp) => rp.roleId === roleId && rp.permissionId === permissionId
        );
      };

      for (const key of [
        ...updateActions,
        ...readOnlyListActions,
        ...adminListActions,
      ]) {
        expect(hasMapping("workspace_owner", key)).toBe(true);
        expect(hasMapping("content_editor", key)).toBe(true);
      }
      for (const key of readOnlyListActions)
        expect(hasMapping("read_only", key)).toBe(true);
      for (const key of adminListActions)
        expect(hasMapping("read_only", key)).toBe(false);
      for (const key of updateActions)
        expect(hasMapping("read_only", key)).toBe(false);
    });

    test("owner/editor allowed for update actions", async () => {
      for (const actionKey of updateActions) {
        const ownerRes = await app.request("/authz/check", {
          method: "POST",
          body: JSON.stringify({ userId: ownerUserId, workspaceId, actionKey }),
          headers: new Headers({
            "Content-Type": "application/json",
            "X-Internal-Service-Token": INTERNAL_SERVICE_TOKEN,
          }),
        });
        expect(ownerRes.status).toBe(200);
        expect(((await ownerRes.json()) as CheckSuccess).data.allowed).toBe(
          true
        );

        const editorRes = await app.request("/authz/check", {
          method: "POST",
          body: JSON.stringify({
            userId: editorUserId,
            workspaceId,
            actionKey,
          }),
          headers: new Headers({
            "Content-Type": "application/json",
            "X-Internal-Service-Token": INTERNAL_SERVICE_TOKEN,
          }),
        });
        expect(editorRes.status).toBe(200);
        expect(((await editorRes.json()) as CheckSuccess).data.allowed).toBe(
          true
        );
      }
    }, 15_000);

    test("read_only allowed for non-admin list actions", async () => {
      for (const actionKey of readOnlyListActions) {
        const res = await app.request("/authz/check", {
          method: "POST",
          body: JSON.stringify({
            userId: readOnlyUserId,
            workspaceId,
            actionKey,
          }),
          headers: new Headers({
            "Content-Type": "application/json",
            "X-Internal-Service-Token": INTERNAL_SERVICE_TOKEN,
          }),
        });
        expect(res.status).toBe(200);
        expect(((await res.json()) as CheckSuccess).data.allowed).toBe(true);
      }
    }, 15_000);

    test("read_only denied for admin list actions", async () => {
      for (const actionKey of adminListActions) {
        const res = await app.request("/authz/check", {
          method: "POST",
          body: JSON.stringify({
            userId: readOnlyUserId,
            workspaceId,
            actionKey,
          }),
          headers: new Headers({
            "Content-Type": "application/json",
            "X-Internal-Service-Token": INTERNAL_SERVICE_TOKEN,
          }),
        });
        expect(res.status).toBe(200);
        expect(((await res.json()) as CheckSuccess).data.allowed).toBe(false);
      }
    }, 15_000);

    test("read_only denied for update actions", async () => {
      for (const actionKey of updateActions) {
        const res = await app.request("/authz/check", {
          method: "POST",
          body: JSON.stringify({
            userId: readOnlyUserId,
            workspaceId,
            actionKey,
          }),
          headers: new Headers({
            "Content-Type": "application/json",
            "X-Internal-Service-Token": INTERNAL_SERVICE_TOKEN,
          }),
        });
        expect(res.status).toBe(200);
        expect(((await res.json()) as CheckSuccess).data.allowed).toBe(false);
      }
    }, 15_000);

    test("owner/editor allowed for admin list actions", async () => {
      for (const actionKey of adminListActions) {
        const ownerRes = await app.request("/authz/check", {
          method: "POST",
          body: JSON.stringify({ userId: ownerUserId, workspaceId, actionKey }),
          headers: new Headers({
            "Content-Type": "application/json",
            "X-Internal-Service-Token": INTERNAL_SERVICE_TOKEN,
          }),
        });
        expect(ownerRes.status).toBe(200);
        expect(((await ownerRes.json()) as CheckSuccess).data.allowed).toBe(
          true
        );

        const editorRes = await app.request("/authz/check", {
          method: "POST",
          body: JSON.stringify({
            userId: editorUserId,
            workspaceId,
            actionKey,
          }),
          headers: new Headers({
            "Content-Type": "application/json",
            "X-Internal-Service-Token": INTERNAL_SERVICE_TOKEN,
          }),
        });
        expect(editorRes.status).toBe(200);
        expect(((await editorRes.json()) as CheckSuccess).data.allowed).toBe(
          true
        );
      }
    }, 15_000);
  }
);
