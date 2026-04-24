import { describe, expect, test } from "bun:test";
import {
  AUTHZ_PERMISSIONS,
  AUTHZ_ROLES,
} from "../../src/db/seed/permissions.config";

/**
 * Workspace Admin Integrations — Authz Permission Catalog
 *
 * Source of truth:
 * - `xynes/xynes-infra/infra/architecture/epics/workspace-admin-integrations.md`
 * - `xynes/xynes-infra/docs/plans/2026-04-24-workspace-admin-integrations-backend-foundation.md`
 *
 * Plan Task 2: Add Authz Permissions
 *
 * These tests lock in the MVP permission surface for workspace-admin
 * integration primitives (verified domains + global API keys) and the
 * initial role mapping:
 *
 *   - `workspace_owner` + `super_admin` -> full manage
 *   - `workspace_member`, `content_editor`, `read_only` ->
 *       no API key create/revoke, no domain lifecycle writes
 */
describe("Workspace Admin Integrations — permission catalog (Unit)", () => {
  const expectedPlatformIntegrationPermissions = [
    "platform.domains.list",
    "platform.domains.create",
    "platform.domains.verify",
    "platform.domains.delete",
    "platform.domain_bindings.manage",
    "platform.api_keys.list",
    "platform.api_keys.create",
    "platform.api_keys.revoke",
    "platform.api_keys.usage.read",
  ] as const;

  const apiKeyLifecycleWritePermissions = [
    "platform.api_keys.create",
    "platform.api_keys.revoke",
  ] as const;

  const domainLifecycleWritePermissions = [
    "platform.domains.create",
    "platform.domains.verify",
    "platform.domains.delete",
    "platform.domain_bindings.manage",
  ] as const;

  // ─────────────────────────────────────────────────────────────────────────
  // PERMISSION DEFINITIONS
  // ─────────────────────────────────────────────────────────────────────────

  describe("Permission definitions", () => {
    test("includes all expected platform integration permissions", () => {
      const keys = new Set(AUTHZ_PERMISSIONS.map((p) => p.key));
      for (const key of expectedPlatformIntegrationPermissions) {
        expect(keys.has(key)).toBe(true);
      }
    });

    test("all platform integration permissions have non-empty descriptions", () => {
      const byKey = new Map(AUTHZ_PERMISSIONS.map((p) => [p.key, p]));
      for (const key of expectedPlatformIntegrationPermissions) {
        const perm = byKey.get(key);
        expect(perm).toBeTruthy();
        expect(typeof perm?.description).toBe("string");
        expect((perm?.description ?? "").length).toBeGreaterThan(0);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // ROLE: workspace_owner
  // ─────────────────────────────────────────────────────────────────────────

  describe("workspace_owner role", () => {
    test("includes every platform integration permission", () => {
      const owner = AUTHZ_ROLES.find((r) => r.key === "workspace_owner");
      expect(owner).toBeTruthy();
      for (const key of expectedPlatformIntegrationPermissions) {
        expect(owner?.permissions.includes(key)).toBe(true);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // ROLE: super_admin
  // ─────────────────────────────────────────────────────────────────────────

  describe("super_admin role", () => {
    test("includes every platform integration permission", () => {
      const superAdmin = AUTHZ_ROLES.find((r) => r.key === "super_admin");
      expect(superAdmin).toBeTruthy();
      for (const key of expectedPlatformIntegrationPermissions) {
        expect(superAdmin?.permissions.includes(key)).toBe(true);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // ROLE: workspace_member (restricted)
  // ─────────────────────────────────────────────────────────────────────────

  describe("workspace_member role", () => {
    test("does NOT include API key create/revoke permissions", () => {
      const member = AUTHZ_ROLES.find((r) => r.key === "workspace_member");
      expect(member).toBeTruthy();
      for (const key of apiKeyLifecycleWritePermissions) {
        expect(member?.permissions.includes(key)).toBe(false);
      }
    });

    test("does NOT include any domain lifecycle write permission", () => {
      const member = AUTHZ_ROLES.find((r) => r.key === "workspace_member");
      expect(member).toBeTruthy();
      for (const key of domainLifecycleWritePermissions) {
        expect(member?.permissions.includes(key)).toBe(false);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // ROLE: content_editor (restricted)
  // ─────────────────────────────────────────────────────────────────────────

  describe("content_editor role", () => {
    test("does NOT include API key create/revoke permissions", () => {
      const editor = AUTHZ_ROLES.find((r) => r.key === "content_editor");
      expect(editor).toBeTruthy();
      for (const key of apiKeyLifecycleWritePermissions) {
        expect(editor?.permissions.includes(key)).toBe(false);
      }
    });

    test("does NOT include any domain lifecycle write permission", () => {
      const editor = AUTHZ_ROLES.find((r) => r.key === "content_editor");
      expect(editor).toBeTruthy();
      for (const key of domainLifecycleWritePermissions) {
        expect(editor?.permissions.includes(key)).toBe(false);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // ROLE: read_only (restricted)
  // ─────────────────────────────────────────────────────────────────────────

  describe("read_only role", () => {
    test("does NOT include API key create/revoke permissions", () => {
      const readOnly = AUTHZ_ROLES.find((r) => r.key === "read_only");
      expect(readOnly).toBeTruthy();
      for (const key of apiKeyLifecycleWritePermissions) {
        expect(readOnly?.permissions.includes(key)).toBe(false);
      }
    });

    test("does NOT include any domain lifecycle write permission", () => {
      const readOnly = AUTHZ_ROLES.find((r) => r.key === "read_only");
      expect(readOnly).toBeTruthy();
      for (const key of domainLifecycleWritePermissions) {
        expect(readOnly?.permissions.includes(key)).toBe(false);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // KEY FORMAT (security): keep `platform.*` keys stable and well-formed
  // ─────────────────────────────────────────────────────────────────────────

  describe("platform.* key format", () => {
    test("each expected platform integration key is present exactly once", () => {
      const keys = AUTHZ_PERMISSIONS.map((p) => p.key);
      for (const key of expectedPlatformIntegrationPermissions) {
        const count = keys.filter((k) => k === key).length;
        expect(count).toBe(1);
      }
    });
  });
});
