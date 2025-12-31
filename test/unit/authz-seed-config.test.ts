/**
 * AUTHZ Seed Logic Unit Tests
 *
 * Tests for the seed configuration and logic validation.
 * These tests don't require a database connection.
 */

import { describe, expect, test } from "bun:test";
import {
  AUTHZ_PERMISSIONS,
  AUTHZ_ROLES,
  type PermissionKey,
  type RoleKey,
} from "../../src/db/seed/permissions.config";

describe("AUTHZ Seed Configuration (Unit)", () => {
  describe("Permission Configuration", () => {
    test("all permissions have required fields", () => {
      for (const perm of AUTHZ_PERMISSIONS) {
        expect(perm.key).toBeDefined();
        expect(typeof perm.key).toBe("string");
        expect(perm.key.length).toBeGreaterThan(0);
        expect(perm.description).toBeDefined();
        expect(typeof perm.description).toBe("string");
      }
    });

    test("permission keys follow naming convention", () => {
      // Format: service.resource.action (resource may contain underscores)
      // Examples: docs.document.create, cms.blog_entry.read, telemetry.view
      const pattern = /^[a-z_]+\.[a-z_]+\.[a-zA-Z]+$/;
      for (const perm of AUTHZ_PERMISSIONS) {
        expect(pattern.test(perm.key)).toBe(true);
      }
    });

    test("no permission key exceeds max length", () => {
      const MAX_KEY_LENGTH = 128;
      for (const perm of AUTHZ_PERMISSIONS) {
        expect(perm.key.length).toBeLessThanOrEqual(MAX_KEY_LENGTH);
      }
    });

    test("permission keys are unique", () => {
      const keys = AUTHZ_PERMISSIONS.map((p) => p.key);
      expect(new Set(keys).size).toBe(keys.length);
    });
  });

  describe("Role Configuration", () => {
    test("all roles have required fields", () => {
      for (const role of AUTHZ_ROLES) {
        expect(role.key).toBeDefined();
        expect(typeof role.key).toBe("string");
        expect(role.description).toBeDefined();
        expect(typeof role.description).toBe("string");
        expect(Array.isArray(role.permissions)).toBe(true);
      }
    });

    test("role keys are unique", () => {
      const keys = AUTHZ_ROLES.map((r) => r.key);
      expect(new Set(keys).size).toBe(keys.length);
    });

    test("required roles exist", () => {
      const roleKeys = new Set(AUTHZ_ROLES.map((r) => r.key));
      expect(roleKeys.has("workspace_owner")).toBe(true);
      expect(roleKeys.has("workspace_member")).toBe(true);
      expect(roleKeys.has("content_editor")).toBe(true);
      expect(roleKeys.has("read_only")).toBe(true);
      expect(roleKeys.has("super_admin")).toBe(true);
    });
  });

  describe("Role-Permission Integrity", () => {
    const allPermissionKeys = new Set(AUTHZ_PERMISSIONS.map((p) => p.key));

    test("all role permissions reference valid permission keys", () => {
      for (const role of AUTHZ_ROLES) {
        for (const permKey of role.permissions) {
          expect(allPermissionKeys.has(permKey)).toBe(true);
        }
      }
    });

    test("workspace_owner has all permissions", () => {
      const owner = AUTHZ_ROLES.find((r) => r.key === "workspace_owner");
      expect(owner).toBeDefined();
      expect(owner?.permissions.length).toBe(AUTHZ_PERMISSIONS.length);
    });

    test("super_admin has all permissions", () => {
      const superAdmin = AUTHZ_ROLES.find((r) => r.key === "super_admin");
      expect(superAdmin).toBeDefined();
      expect(superAdmin?.permissions.length).toBe(AUTHZ_PERMISSIONS.length);
    });

    test("read_only has fewer permissions than content_editor", () => {
      const readOnly = AUTHZ_ROLES.find((r) => r.key === "read_only");
      const editor = AUTHZ_ROLES.find((r) => r.key === "content_editor");
      expect(readOnly).toBeDefined();
      expect(editor).toBeDefined();
      expect(readOnly?.permissions.length).toBeLessThan(editor?.permissions.length);
    });
  });

  describe("Type Safety", () => {
    test("PermissionKey type matches actual keys", () => {
      // This is a compile-time check - if it compiles, types are correct
      const keys: PermissionKey[] = AUTHZ_PERMISSIONS.map((p) => p.key);
      expect(keys.length).toBe(AUTHZ_PERMISSIONS.length);
    });

    test("RoleKey type matches actual keys", () => {
      const keys: RoleKey[] = AUTHZ_ROLES.map((r) => r.key);
      expect(keys.length).toBe(AUTHZ_ROLES.length);
    });
  });

  describe("AUTHZ-RBAC-2 Permissions", () => {
    const cmsDocsPermissionKeys = [
      "docs.document.create",
      "docs.document.read",
      "docs.document.update",
      "docs.document.listByWorkspace",
      "cms.content_type.manage",
      "cms.content_entry.create",
      "cms.content_entry.update",
      "cms.content_entry.publish",
      "cms.content_entry.listPublished",
      "cms.content_entry.getPublishedBySlug",
      "cms.comments.moderate",
    ] as const;

    test("includes all AUTHZ-RBAC-2 permissions", () => {
      const keys = new Set(AUTHZ_PERMISSIONS.map((p) => p.key));
      for (const key of cmsDocsPermissionKeys) {
        expect(keys.has(key)).toBe(true);
      }
    });

    test("workspace_owner has all AUTHZ-RBAC-2 permissions", () => {
      const owner = AUTHZ_ROLES.find((r) => r.key === "workspace_owner");
      expect(owner).toBeTruthy();
      for (const key of cmsDocsPermissionKeys) {
        expect(owner?.permissions.includes(key)).toBe(true);
      }
    });

    test("content_editor has all AUTHZ-RBAC-2 permissions", () => {
      const editor = AUTHZ_ROLES.find((r) => r.key === "content_editor");
      expect(editor).toBeTruthy();
      for (const key of cmsDocsPermissionKeys) {
        expect(editor?.permissions.includes(key)).toBe(true);
      }
    });

    test("read_only does NOT have admin AUTHZ-RBAC-2 permissions", () => {
      const readOnly = AUTHZ_ROLES.find((r) => r.key === "read_only");
      expect(readOnly).toBeTruthy();

      // Should NOT have these permissions
      expect(readOnly?.permissions.includes("cms.content_type.manage")).toBe(false);
      expect(readOnly?.permissions.includes("cms.content_entry.create")).toBe(false);
      expect(readOnly?.permissions.includes("cms.content_entry.update")).toBe(false);
      expect(readOnly?.permissions.includes("cms.content_entry.publish")).toBe(false);
      expect(readOnly?.permissions.includes("cms.comments.moderate")).toBe(false);
      expect(readOnly?.permissions.includes("docs.document.create")).toBe(false);
      expect(readOnly?.permissions.includes("docs.document.update")).toBe(false);

      // Should have these read-only permissions
      expect(readOnly?.permissions.includes("docs.document.read")).toBe(true);
      expect(readOnly?.permissions.includes("cms.content_entry.listPublished")).toBe(true);
      expect(readOnly?.permissions.includes("cms.content_entry.getPublishedBySlug")).toBe(true);
    });
  });

  describe("TELE-VIEW-1 Permissions", () => {
    test("telemetry.events.view permission exists", () => {
      const keys = new Set(AUTHZ_PERMISSIONS.map((p) => p.key));
      expect(keys.has("telemetry.events.view")).toBe(true);
    });

    test("telemetry.events.view has correct description", () => {
      const telemetryPerm = AUTHZ_PERMISSIONS.find(
        (p) => p.key === "telemetry.events.view"
      );
      expect(telemetryPerm).toBeDefined();
      expect(telemetryPerm?.description).toBe(
        "View telemetry events and stats for workspace"
      );
    });

    test("workspace_owner has telemetry.events.view", () => {
      const owner = AUTHZ_ROLES.find((r) => r.key === "workspace_owner");
      expect(owner).toBeTruthy();
      expect(owner?.permissions.includes("telemetry.events.view")).toBe(true);
    });

    test("super_admin has telemetry.events.view", () => {
      const superAdmin = AUTHZ_ROLES.find((r) => r.key === "super_admin");
      expect(superAdmin).toBeTruthy();
      expect(superAdmin?.permissions.includes("telemetry.events.view")).toBe(true);
    });

    test("read_only does NOT have telemetry.events.view (admin-only feature)", () => {
      const readOnly = AUTHZ_ROLES.find((r) => r.key === "read_only");
      expect(readOnly).toBeTruthy();
      expect(readOnly?.permissions.includes("telemetry.events.view")).toBe(false);
    });

    test("content_editor does NOT have telemetry.events.view (admin-only feature)", () => {
      // TELE-VIEW-1: telemetry.events.view is intentionally excluded from content_editor
      // Telemetry data is sensitive and should only be accessible to workspace owners/admins
      const editor = AUTHZ_ROLES.find((r) => r.key === "content_editor");
      expect(editor).toBeTruthy();
      expect(editor?.permissions.includes("telemetry.events.view")).toBe(false);
    });

    test("workspace_member does NOT have telemetry.events.view", () => {
      const member = AUTHZ_ROLES.find((r) => r.key === "workspace_member");
      expect(member).toBeTruthy();
      expect(member?.permissions.includes("telemetry.events.view")).toBe(false);
    });
  });
});
