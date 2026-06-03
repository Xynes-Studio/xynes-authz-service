import { describe, expect, test } from "bun:test";
import {
  AUTHZ_PERMISSIONS,
  AUTHZ_ROLES,
} from "../../src/db/seed/permissions.config";

/**
 * MAIL-5 — Accounts Invites Permission Catalog
 *
 * Source of truth:
 *   - xynes/xynes-infra/docs/plans/2026-05-30-invite-mail-delivery.md §9.4
 *   - xynes-accounts-service src/actions/handlers/invites/{create,resend}.ts
 *
 * Plan §9.4 expectation: add `accounts.invites.resend` granted ONLY to
 * `workspace_owner` + `super_admin` (mirrors `accounts.invites.create`
 * posture). No other role gets it.
 *
 * These tests lock in:
 *   - The permission exists in the catalog with a non-empty description.
 *   - The two privileged roles include it (positive).
 *   - The three restricted roles (workspace_member, content_editor,
 *     read_only) do NOT include it (negative — no enumeration via
 *     restricted-role token).
 *
 * Mirrors the pattern used by
 * `workspace-admin-integrations-permissions.test.ts`.
 */
describe("Accounts Invites — permission catalog (Unit)", () => {
  const expectedAccountsInvitesPermissions = [
    "accounts.invites.create",
    "accounts.invites.resend",
  ] as const;

  const privilegedRoles = ["workspace_owner", "super_admin"] as const;
  const restrictedRoles = [
    "workspace_member",
    "content_editor",
    "read_only",
  ] as const;

  // ─────────────────────────────────────────────────────────────────────────
  // PERMISSION DEFINITIONS
  // ─────────────────────────────────────────────────────────────────────────

  describe("Permission definitions", () => {
    test("includes accounts.invites.create + accounts.invites.resend", () => {
      const keys = new Set(AUTHZ_PERMISSIONS.map((p) => p.key));
      for (const key of expectedAccountsInvitesPermissions) {
        expect(keys.has(key)).toBe(true);
      }
    });

    test("all accounts.invites permissions have non-empty descriptions", () => {
      const byKey = new Map(AUTHZ_PERMISSIONS.map((p) => [p.key, p]));
      for (const key of expectedAccountsInvitesPermissions) {
        const perm = byKey.get(key);
        expect(perm).toBeDefined();
        expect(typeof perm?.description).toBe("string");
        expect(perm?.description.length).toBeGreaterThan(0);
      }
    });

    test("permission keys follow the dotted action-key convention", () => {
      // service.resource.action — defense in depth on top of the
      // generic naming-convention test in authz-seed-config.test.ts.
      for (const key of expectedAccountsInvitesPermissions) {
        expect(key).toMatch(/^accounts\.invites\.[a-z]+$/);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVILEGED ROLES — must include every accounts.invites permission
  // ─────────────────────────────────────────────────────────────────────────

  for (const roleKey of privilegedRoles) {
    describe(`${roleKey} role`, () => {
      test(`includes every accounts.invites permission`, () => {
        const role = AUTHZ_ROLES.find((r) => r.key === roleKey);
        expect(role).toBeTruthy();
        for (const key of expectedAccountsInvitesPermissions) {
          expect(role?.permissions.includes(key)).toBe(true);
        }
      });
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RESTRICTED ROLES — must NOT include accounts.invites.{create,resend}
  //
  // Per plan §9.4, only workspace_owner + super_admin should be allowed to
  // create or resend workspace invites. Lower-tier roles must remain
  // explicitly excluded so an additive permission catalog change (e.g. a
  // future bulk-permission grant on workspace_member) doesn't silently
  // leak the resend capability.
  // ─────────────────────────────────────────────────────────────────────────

  for (const roleKey of restrictedRoles) {
    describe(`${roleKey} role`, () => {
      test(`does NOT include any accounts.invites lifecycle permission`, () => {
        const role = AUTHZ_ROLES.find((r) => r.key === roleKey);
        expect(role).toBeTruthy();
        for (const key of expectedAccountsInvitesPermissions) {
          expect(role?.permissions.includes(key)).toBe(false);
        }
      });
    });
  }
});
