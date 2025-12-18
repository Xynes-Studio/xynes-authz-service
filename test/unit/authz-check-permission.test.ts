import { describe, expect, test, mock } from "bun:test";
import { checkPermission } from "../../src/services/authz.service";

describe("AuthzService.checkPermission (Unit via dependency injection)", () => {
  test("returns false when user has no roles", async () => {
    const roleHasPermission = mock();
    const allowed = await checkPermission("u1", "w1", "docs.document.update", {
      fetchUserRoles: async () => [],
      roleHasPermission,
    });
    expect(allowed).toBe(false);
    expect(roleHasPermission).toHaveBeenCalledTimes(0);
  });

  test("returns true when user has super_admin role", async () => {
    const roleHasPermission = mock();
    const allowed = await checkPermission("u1", "w1", "any.action", {
      fetchUserRoles: async () => [{ roleKey: "super_admin", roleId: "r-super" }],
      roleHasPermission,
    });
    expect(allowed).toBe(true);
    expect(roleHasPermission).toHaveBeenCalledTimes(0);
  });

  test("delegates to roleHasPermission for non-super_admin roles", async () => {
    const roleHasPermission = mock();
    roleHasPermission.mockResolvedValueOnce(true);

    const allowed = await checkPermission("u1", "w1", "cms.blog_entry.updateMeta", {
      fetchUserRoles: async () => [
        { roleKey: "content_editor", roleId: "r-editor" },
        { roleKey: "read_only", roleId: "r-read" },
      ],
      roleHasPermission,
    });

    expect(allowed).toBe(true);
    expect(roleHasPermission).toHaveBeenCalledTimes(1);
    expect(roleHasPermission).toHaveBeenCalledWith(["r-editor", "r-read"], "cms.blog_entry.updateMeta");
  });

  test("returns false when roleHasPermission returns false", async () => {
    const roleHasPermission = mock();
    roleHasPermission.mockResolvedValueOnce(false);

    const allowed = await checkPermission("u1", "w1", "docs.document.listByWorkspace", {
      fetchUserRoles: async () => [{ roleKey: "read_only", roleId: "r-read" }],
      roleHasPermission,
    });

    expect(allowed).toBe(false);
  });
});

describe("AuthzService.checkPermission (Unit, default deps via injected getDb)", () => {
  class FakeDb {
    constructor(
      private userRoleRows: { roleKey: string; roleId: string }[],
      private permissionRows: { id: string }[]
    ) {}

    select(selection: Record<string, unknown>) {
      if ("roleKey" in selection && "roleId" in selection) {
        return {
          from: (_: unknown) => ({
            innerJoin: (_join: unknown, _on: unknown) => ({
              where: async (_where: unknown) => this.userRoleRows,
            }),
          }),
        };
      }

      if ("id" in selection) {
        return {
          from: (_: unknown) => ({
            innerJoin: (_join: unknown, _on: unknown) => ({
              where: (_where: unknown) => ({
                limit: async (_n: number) => this.permissionRows,
              }),
            }),
          }),
        };
      }

      throw new Error("FakeDb: unsupported selection");
    }
  }

  test("returns true when default db-backed roleHasPermission finds a permission row", async () => {
    const fakeDb = new FakeDb([{ roleKey: "content_editor", roleId: "r-editor" }], [{ id: "p1" }]);
    const allowed = await checkPermission("u1", "w1", "docs.document.read", {
      getDb: async () => ({ db: fakeDb }),
    });
    expect(allowed).toBe(true);
  });

  test("returns false when default db-backed roleHasPermission finds no permission rows", async () => {
    const fakeDb = new FakeDb([{ roleKey: "content_editor", roleId: "r-editor" }], []);
    const allowed = await checkPermission("u1", "w1", "docs.document.read", {
      getDb: async () => ({ db: fakeDb }),
    });
    expect(allowed).toBe(false);
  });
});
