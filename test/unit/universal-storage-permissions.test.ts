import { describe, expect, test } from "bun:test";
import {
  AUTHZ_PERMISSIONS,
  AUTHZ_ROLES,
} from "../../src/db/seed/permissions.config";

/**
 * Universal Object Storage — Authz Permission Catalog (STORAGE-3)
 *
 * Source of truth:
 *   - xynes/xynes-infra/docs/plans/2026-05-10-universal-object-storage-file-upload-api.md §8
 *   - xynes/xynes-storage-service/docs/architecture.md
 *
 * STORAGE-3 acceptance criteria:
 *   - All 6 platform.storage.* permissions exist in the catalog.
 *   - workspace_owner + super_admin: all 6 (catalog-derived).
 *   - content_editor: upload + read; NO delete / providers.manage /
 *     process.retry / usage.read.
 *   - workspace_member: read only (MVP default); NO upload / mutation /
 *     provider config.
 *   - read_only: read only; NO upload / mutation / provider config.
 *
 * Role posture is conservative on purpose. Plan §12 (open questions)
 * defers expanding workspace_member to include upload until product
 * policy confirms general members can upload non-CMS files. If that
 * decision flips, update the role allowlist AND this test together so
 * the change is intentional rather than incidental.
 */
describe("Universal Object Storage — permission catalog (STORAGE-3)", () => {
  const expectedStoragePermissions = [
    "platform.storage.providers.manage",
    "platform.storage.objects.upload",
    "platform.storage.objects.read",
    "platform.storage.objects.delete",
    "platform.storage.objects.process.retry",
    "platform.storage.usage.read",
  ] as const;

  const storageWritePermissions = [
    "platform.storage.objects.upload",
    "platform.storage.objects.delete",
    "platform.storage.objects.process.retry",
  ] as const;

  const storageAdminPermissions = [
    "platform.storage.providers.manage",
    "platform.storage.usage.read",
  ] as const;

  // ─────────────────────────────────────────────────────────────────────────
  // PERMISSION DEFINITIONS
  // ─────────────────────────────────────────────────────────────────────────

  describe("Permission definitions", () => {
    test("includes all 6 expected storage permissions", () => {
      const keys = new Set(AUTHZ_PERMISSIONS.map((p) => p.key));
      for (const key of expectedStoragePermissions) {
        expect(keys.has(key)).toBe(true);
      }
    });

    test("every storage permission has a non-empty description", () => {
      const byKey = new Map(AUTHZ_PERMISSIONS.map((p) => [p.key, p]));
      for (const key of expectedStoragePermissions) {
        const perm = byKey.get(key);
        expect(perm).toBeTruthy();
        expect(typeof perm?.description).toBe("string");
        expect((perm?.description ?? "").length).toBeGreaterThan(0);
      }
    });

    test("each storage permission appears exactly once", () => {
      const keys = AUTHZ_PERMISSIONS.map((p) => p.key);
      for (const key of expectedStoragePermissions) {
        const count = keys.filter((k) => k === key).length;
        expect(count).toBe(1);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // ROLE: workspace_owner
  // ─────────────────────────────────────────────────────────────────────────

  describe("workspace_owner role", () => {
    test("includes every storage permission (catalog-derived)", () => {
      const owner = AUTHZ_ROLES.find((r) => r.key === "workspace_owner");
      expect(owner).toBeTruthy();
      for (const key of expectedStoragePermissions) {
        expect(owner?.permissions.includes(key)).toBe(true);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // ROLE: super_admin
  // ─────────────────────────────────────────────────────────────────────────

  describe("super_admin role", () => {
    test("includes every storage permission (catalog-derived)", () => {
      const superAdmin = AUTHZ_ROLES.find((r) => r.key === "super_admin");
      expect(superAdmin).toBeTruthy();
      for (const key of expectedStoragePermissions) {
        expect(superAdmin?.permissions.includes(key)).toBe(true);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // ROLE: content_editor (upload + read only)
  // ─────────────────────────────────────────────────────────────────────────

  describe("content_editor role", () => {
    test("includes platform.storage.objects.upload", () => {
      const editor = AUTHZ_ROLES.find((r) => r.key === "content_editor");
      expect(editor).toBeTruthy();
      expect(
        editor?.permissions.includes("platform.storage.objects.upload"),
      ).toBe(true);
    });

    test("includes platform.storage.objects.read", () => {
      const editor = AUTHZ_ROLES.find((r) => r.key === "content_editor");
      expect(editor).toBeTruthy();
      expect(
        editor?.permissions.includes("platform.storage.objects.read"),
      ).toBe(true);
    });

    test("does NOT include platform.storage.objects.delete", () => {
      const editor = AUTHZ_ROLES.find((r) => r.key === "content_editor");
      expect(editor).toBeTruthy();
      expect(
        editor?.permissions.includes("platform.storage.objects.delete"),
      ).toBe(false);
    });

    test("does NOT include platform.storage.objects.process.retry", () => {
      const editor = AUTHZ_ROLES.find((r) => r.key === "content_editor");
      expect(editor).toBeTruthy();
      expect(
        editor?.permissions.includes("platform.storage.objects.process.retry"),
      ).toBe(false);
    });

    test("does NOT include any storage admin permission", () => {
      const editor = AUTHZ_ROLES.find((r) => r.key === "content_editor");
      expect(editor).toBeTruthy();
      for (const key of storageAdminPermissions) {
        expect(editor?.permissions.includes(key)).toBe(false);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // ROLE: workspace_member (read-only MVP)
  // ─────────────────────────────────────────────────────────────────────────

  describe("workspace_member role (MVP read-only)", () => {
    test("includes platform.storage.objects.read", () => {
      const member = AUTHZ_ROLES.find((r) => r.key === "workspace_member");
      expect(member).toBeTruthy();
      expect(
        member?.permissions.includes("platform.storage.objects.read"),
      ).toBe(true);
    });

    test("does NOT include any storage write permission", () => {
      const member = AUTHZ_ROLES.find((r) => r.key === "workspace_member");
      expect(member).toBeTruthy();
      for (const key of storageWritePermissions) {
        expect(member?.permissions.includes(key)).toBe(false);
      }
    });

    test("does NOT include any storage admin permission", () => {
      const member = AUTHZ_ROLES.find((r) => r.key === "workspace_member");
      expect(member).toBeTruthy();
      for (const key of storageAdminPermissions) {
        expect(member?.permissions.includes(key)).toBe(false);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // ROLE: read_only
  // ─────────────────────────────────────────────────────────────────────────

  describe("read_only role", () => {
    test("includes platform.storage.objects.read", () => {
      const readOnly = AUTHZ_ROLES.find((r) => r.key === "read_only");
      expect(readOnly).toBeTruthy();
      expect(
        readOnly?.permissions.includes("platform.storage.objects.read"),
      ).toBe(true);
    });

    test("does NOT include any storage write permission", () => {
      const readOnly = AUTHZ_ROLES.find((r) => r.key === "read_only");
      expect(readOnly).toBeTruthy();
      for (const key of storageWritePermissions) {
        expect(readOnly?.permissions.includes(key)).toBe(false);
      }
    });

    test("does NOT include any storage admin permission", () => {
      const readOnly = AUTHZ_ROLES.find((r) => r.key === "read_only");
      expect(readOnly).toBeTruthy();
      for (const key of storageAdminPermissions) {
        expect(readOnly?.permissions.includes(key)).toBe(false);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // KEY FORMAT (security): keep storage keys stable and well-formed
  // ─────────────────────────────────────────────────────────────────────────

  describe("platform.storage.* key format", () => {
    test("every storage key matches the dotted action-key pattern", () => {
      // Mirrors the gateway ACTION_KEY_PATTERN:
      //   /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*\.[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)*$/
      const pattern =
        /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*\.[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)*$/;
      for (const key of expectedStoragePermissions) {
        expect(pattern.test(key)).toBe(true);
      }
    });

    test("every storage key uses the platform.storage.* namespace", () => {
      for (const key of expectedStoragePermissions) {
        expect(key.startsWith("platform.storage.")).toBe(true);
      }
    });
  });
});
