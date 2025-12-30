import { describe, expect, test } from "bun:test";
import {
  AUTHZ_PERMISSIONS,
  AUTHZ_ROLES,
} from "../../src/db/seed/permissions.config";

/**
 * AUTHZ-RBAC-2: CMS & Docs Permissions per Role
 *
 * This test suite validates the permission definitions and role mappings
 * for CMS and Docs services as defined in the story requirements.
 */
describe("AUTHZ-RBAC-2: CMS & Docs Permissions (Unit)", () => {
  // ─────────────────────────────────────────────────────────────────────────
  // PERMISSION DEFINITIONS
  // ─────────────────────────────────────────────────────────────────────────

  describe("Permission Definitions", () => {
    const docsPermissions = [
      "docs.document.create",
      "docs.document.update",
      "docs.document.read",
    ] as const;

    const cmsContentPermissions = [
      "cms.content_type.manage",
      "cms.content_entry.create",
      "cms.content_entry.update",
      "cms.content_entry.publish",
      "cms.content_entry.listPublished",
      "cms.content_entry.getPublishedBySlug",
    ] as const;

    const cmsCommentPermissions = ["cms.comments.moderate"] as const;

    const allNewPermissions = [
      ...docsPermissions,
      ...cmsContentPermissions,
      ...cmsCommentPermissions,
    ] as const;

    test("includes all required Docs permissions", () => {
      const keys = new Set(AUTHZ_PERMISSIONS.map((p) => p.key));
      for (const key of docsPermissions) {
        expect(keys.has(key)).toBe(true);
      }
    });

    test("includes all required CMS content permissions", () => {
      const keys = new Set(AUTHZ_PERMISSIONS.map((p) => p.key));
      for (const key of cmsContentPermissions) {
        expect(keys.has(key)).toBe(true);
      }
    });

    test("includes CMS comments.moderate permission", () => {
      const keys = new Set(AUTHZ_PERMISSIONS.map((p) => p.key));
      expect(keys.has("cms.comments.moderate")).toBe(true);
    });

    test("all permission keys are unique", () => {
      const keys = AUTHZ_PERMISSIONS.map((p) => p.key);
      expect(new Set(keys).size).toBe(keys.length);
    });

    test("all permissions have descriptions", () => {
      for (const perm of AUTHZ_PERMISSIONS) {
        expect(perm.description).toBeTruthy();
        expect(typeof perm.description).toBe("string");
        expect(perm.description.length).toBeGreaterThan(0);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // ROLE: workspace_owner
  // ─────────────────────────────────────────────────────────────────────────

  describe("workspace_owner role", () => {
    const ownerPermissions = [
      // Docs
      "docs.document.create",
      "docs.document.update",
      "docs.document.read",
      // CMS Content
      "cms.content_type.manage",
      "cms.content_entry.create",
      "cms.content_entry.update",
      "cms.content_entry.publish",
      "cms.content_entry.listPublished",
      "cms.content_entry.getPublishedBySlug",
      // CMS Comments
      "cms.comments.moderate",
    ] as const;

    test("role exists", () => {
      const owner = AUTHZ_ROLES.find((r) => r.key === "workspace_owner");
      expect(owner).toBeTruthy();
    });

    test("has all CMS & Docs permissions", () => {
      const owner = AUTHZ_ROLES.find((r) => r.key === "workspace_owner");
      expect(owner).toBeTruthy();
      for (const key of ownerPermissions) {
        expect(owner?.permissions.includes(key)).toBe(true);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // ROLE: content_editor
  // ─────────────────────────────────────────────────────────────────────────

  describe("content_editor role", () => {
    const editorPermissions = [
      // Docs
      "docs.document.create",
      "docs.document.update",
      "docs.document.read",
      // CMS Content (all except content_type.manage per story option)
      "cms.content_type.manage", // Included per default in story
      "cms.content_entry.create",
      "cms.content_entry.update",
      "cms.content_entry.publish",
      "cms.content_entry.listPublished",
      "cms.content_entry.getPublishedBySlug",
      // CMS Comments
      "cms.comments.moderate",
    ] as const;

    test("role exists", () => {
      const editor = AUTHZ_ROLES.find((r) => r.key === "content_editor");
      expect(editor).toBeTruthy();
    });

    test("has all CMS & Docs permissions including comments.moderate", () => {
      const editor = AUTHZ_ROLES.find((r) => r.key === "content_editor");
      expect(editor).toBeTruthy();
      for (const key of editorPermissions) {
        expect(editor?.permissions.includes(key)).toBe(true);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // ROLE: read_only
  // ─────────────────────────────────────────────────────────────────────────

  describe("read_only role", () => {
    const allowedPermissions = [
      "docs.document.read",
      "cms.content_entry.listPublished",
      "cms.content_entry.getPublishedBySlug",
    ] as const;

    const deniedPermissions = [
      // Docs write
      "docs.document.create",
      "docs.document.update",
      // CMS Content write/admin
      "cms.content_type.manage",
      "cms.content_entry.create",
      "cms.content_entry.update",
      "cms.content_entry.publish",
      // CMS Comments admin
      "cms.comments.moderate",
    ] as const;

    test("role exists", () => {
      const readOnly = AUTHZ_ROLES.find((r) => r.key === "read_only");
      expect(readOnly).toBeTruthy();
    });

    test("has read-only allowed permissions", () => {
      const readOnly = AUTHZ_ROLES.find((r) => r.key === "read_only");
      expect(readOnly).toBeTruthy();
      for (const key of allowedPermissions) {
        expect(readOnly?.permissions.includes(key)).toBe(true);
      }
    });

    test("does NOT have create/update/publish/moderate permissions", () => {
      const readOnly = AUTHZ_ROLES.find((r) => r.key === "read_only");
      expect(readOnly).toBeTruthy();
      for (const key of deniedPermissions) {
        expect(readOnly?.permissions.includes(key)).toBe(false);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // ROLE: super_admin (should have all permissions)
  // ─────────────────────────────────────────────────────────────────────────

  describe("super_admin role", () => {
    test("role exists", () => {
      const superAdmin = AUTHZ_ROLES.find((r) => r.key === "super_admin");
      expect(superAdmin).toBeTruthy();
    });

    test("has all defined permissions", () => {
      const superAdmin = AUTHZ_ROLES.find((r) => r.key === "super_admin");
      expect(superAdmin).toBeTruthy();
      const allKeys = AUTHZ_PERMISSIONS.map((p) => p.key);
      for (const key of allKeys) {
        expect(superAdmin?.permissions.includes(key)).toBe(true);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // SECURITY: Permission key format validation
  // ─────────────────────────────────────────────────────────────────────────

  describe("Permission key security", () => {
    test("all permission keys follow service.resource.action format", () => {
      const keyPattern = /^[a-z]+\.[a-z_]+\.[a-zA-Z]+$/;
      for (const perm of AUTHZ_PERMISSIONS) {
        expect(keyPattern.test(perm.key)).toBe(true);
      }
    });

    test("no duplicate permission keys", () => {
      const keys = AUTHZ_PERMISSIONS.map((p) => p.key);
      const duplicates = keys.filter((key, idx) => keys.indexOf(key) !== idx);
      expect(duplicates).toEqual([]);
    });

    test("role permission arrays contain only valid permission keys", () => {
      const validKeys = new Set(AUTHZ_PERMISSIONS.map((p) => p.key));
      for (const role of AUTHZ_ROLES) {
        for (const permKey of role.permissions) {
          expect(validKeys.has(permKey)).toBe(true);
        }
      }
    });
  });
});
