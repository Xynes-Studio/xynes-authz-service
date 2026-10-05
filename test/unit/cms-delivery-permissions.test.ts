import { describe, expect, test } from "bun:test";
import { AUTHZ_PERMISSIONS, AUTHZ_ROLES } from "../../src/db/seed/permissions.config";

const deliveryKeys = ["cms.delivery.listByDirectory", "cms.delivery.getById"] as const;
describe("CMS delivery read permissions", () => {
  test("defines exactly two described read operations", () => {
    const permissions = AUTHZ_PERMISSIONS.filter(p => p.key.startsWith("cms.delivery."));
    expect(permissions.map(p => p.key).sort()).toEqual([...deliveryKeys].sort());
    for (const permission of permissions) expect(permission.description.length).toBeGreaterThan(0);
  });
  for (const roleKey of ["workspace_owner", "super_admin", "content_editor", "read_only"]) {
    test(`${roleKey} retains published reads and can read delivery`, () => {
      const role = AUTHZ_ROLES.find(r => r.key === roleKey);
      expect(role).toBeDefined();
      expect(role?.permissions).toContain("cms.content.listPublished");
      for (const key of deliveryKeys) expect(role?.permissions).toContain(key);
    });
  }
  test("workspace_member receives no delivery grant", () => {
    const member = AUTHZ_ROLES.find(r => r.key === "workspace_member");
    expect(member).toBeDefined();
    for (const key of deliveryKeys) expect(member?.permissions).not.toContain(key);
  });
  test("read_only receives neither writes nor key lifecycle permissions", () => {
    const role = AUTHZ_ROLES.find(r => r.key === "read_only");
    for (const key of ["cms.entry.create", "cms.entry.publish", "platform.api_keys.create", "platform.api_keys.revoke"] as const)
      expect(role?.permissions).not.toContain(key);
  });
});
