import { describe, expect, test, mock } from "bun:test";
import { AuthzService } from "../../src/services/authz.service";

describe("AuthzService.checkPermission (Unit via dependency injection)", () => {
  test("returns false when user has no roles", async () => {
    const roleHasPermission = mock();
    const allowed = await AuthzService.checkPermission("u1", "w1", "docs.document.update", {
      fetchUserRoles: async () => [],
      roleHasPermission,
    });
    expect(allowed).toBe(false);
    expect(roleHasPermission).toHaveBeenCalledTimes(0);
  });

  test("returns true when user has super_admin role", async () => {
    const roleHasPermission = mock();
    const allowed = await AuthzService.checkPermission("u1", "w1", "any.action", {
      fetchUserRoles: async () => [{ roleKey: "super_admin", roleId: "r-super" }],
      roleHasPermission,
    });
    expect(allowed).toBe(true);
    expect(roleHasPermission).toHaveBeenCalledTimes(0);
  });

  test("delegates to roleHasPermission for non-super_admin roles", async () => {
    const roleHasPermission = mock();
    roleHasPermission.mockResolvedValueOnce(true);

    const allowed = await AuthzService.checkPermission("u1", "w1", "cms.blog_entry.updateMeta", {
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

    const allowed = await AuthzService.checkPermission("u1", "w1", "docs.document.listByWorkspace", {
      fetchUserRoles: async () => [{ roleKey: "read_only", roleId: "r-read" }],
      roleHasPermission,
    });

    expect(allowed).toBe(false);
  });
});

