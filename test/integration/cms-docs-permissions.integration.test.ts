/**
 * AUTHZ-RBAC-2: CMS & Docs Permissions Integration Tests
 *
 * Tests the /authz/check endpoint with the new permission mappings
 * for CMS and Docs services.
 *
 * These tests require the database to be seeded and accessible.
 * Run with: RUN_INTEGRATION_TESTS=true bun --env-file=.env.localhost test ./test/integration/
 */

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import app from "../../src/index";
import { db } from "../../src/db";
import {
  userRoles,
  roles,
  permissions,
  rolePermissions,
} from "../../src/db/schema";
import { seedAuthz, AUTHZ_PERMISSIONS } from "../../src/db/seed/authz.seed";

// Skip if integration tests are not enabled
const SKIP_INTEGRATION =
  process.env.RUN_INTEGRATION_TESTS !== "true";

describe.skipIf(SKIP_INTEGRATION)(
  "AUTHZ-RBAC-2: CMS & Docs Permissions (Integration)",
  () => {
    // Test identifiers - using UUIDs for isolation
    const TEST_WORKSPACE_ID = randomUUID();
    const OWNER_USER_ID = randomUUID();
    const EDITOR_USER_ID = randomUUID();
    const READONLY_USER_ID = randomUUID();

    // ─────────────────────────────────────────────────────────────────────────
    // NEW PERMISSIONS FROM AUTHZ-RBAC-2 STORY
    // ─────────────────────────────────────────────────────────────────────────

    const CMS_CONTENT_WRITE_PERMISSIONS = [
      "cms.content_type.manage",
      "cms.content_entry.create",
      "cms.content_entry.update",
      "cms.content_entry.publish",
    ] as const;

    const CMS_CONTENT_READ_PERMISSIONS = [
      "cms.content_entry.listPublished",
      "cms.content_entry.getPublishedBySlug",
    ] as const;

    const CMS_COMMENT_ADMIN_PERMISSIONS = ["cms.comments.moderate"] as const;

    const DOCS_WRITE_PERMISSIONS = [
      "docs.document.create",
      "docs.document.update",
    ] as const;

    const DOCS_READ_PERMISSIONS = ["docs.document.read"] as const;

    // ─────────────────────────────────────────────────────────────────────────
    // SETUP & TEARDOWN
    // ─────────────────────────────────────────────────────────────────────────

    beforeAll(async () => {
      // Seed the database (idempotent)
      await seedAuthz({ db });

      // Fetch role keys (validate roles exist)
      const roleRows = await db
        .select({ key: roles.key })
        .from(roles)
        .where(
          inArray(roles.key, [
            "workspace_owner",
            "content_editor",
            "read_only",
          ])
        );

      const roleKeys = new Set(roleRows.map((r) => r.key));

      const ownerRoleKey = roleKeys.has("workspace_owner") ? "workspace_owner" : null;
      const editorRoleKey = roleKeys.has("content_editor") ? "content_editor" : null;
      const readOnlyRoleKey = roleKeys.has("read_only") ? "read_only" : null;

      if (!ownerRoleKey || !editorRoleKey || !readOnlyRoleKey) {
        throw new Error("Required roles not found after seeding");
      }

      // Assign users to roles in the test workspace
      await db
        .insert(userRoles)
        .values([
          {
            workspaceId: TEST_WORKSPACE_ID,
            userId: OWNER_USER_ID,
            roleKey: ownerRoleKey,
          },
          {
            workspaceId: TEST_WORKSPACE_ID,
            userId: EDITOR_USER_ID,
            roleKey: editorRoleKey,
          },
          {
            workspaceId: TEST_WORKSPACE_ID,
            userId: READONLY_USER_ID,
            roleKey: readOnlyRoleKey,
          },
        ])
        .onConflictDoNothing();
    }, 30_000);

    afterAll(async () => {
      // Cleanup: Remove test user role assignments
      await db
        .delete(userRoles)
        .where(eq(userRoles.workspaceId, TEST_WORKSPACE_ID));
    }, 15_000);

    // ─────────────────────────────────────────────────────────────────────────
    // HELPER FUNCTIONS
    // ─────────────────────────────────────────────────────────────────────────

    type CheckResponse = { allowed: boolean };

    async function checkPermission(
      userId: string,
      workspaceId: string,
      actionKey: string
    ): Promise<boolean> {
      const res = await app.request("/authz/check", {
        method: "POST",
        body: JSON.stringify({ userId, workspaceId, actionKey }),
        headers: new Headers({ "Content-Type": "application/json" }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as CheckResponse;
      return body.allowed;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SEED VERIFICATION
    // ─────────────────────────────────────────────────────────────────────────

    describe("Seed verification", () => {
      test("all new permissions exist in database", async () => {
        const allNewKeys = [
          ...CMS_CONTENT_WRITE_PERMISSIONS,
          ...CMS_CONTENT_READ_PERMISSIONS,
          ...CMS_COMMENT_ADMIN_PERMISSIONS,
          ...DOCS_WRITE_PERMISSIONS,
          ...DOCS_READ_PERMISSIONS,
        ];

        const dbPermissions = await db
          .select({ key: permissions.key })
          .from(permissions)
          .where(inArray(permissions.key, allNewKeys));

        const foundKeys = new Set(dbPermissions.map((p) => p.key));
        for (const key of allNewKeys) {
          expect(foundKeys.has(key)).toBe(true);
        }
      });

      test("roles are correctly seeded", async () => {
        const roleRows = await db
          .select({ key: roles.key })
          .from(roles)
          .where(
            inArray(roles.key, [
              "workspace_owner",
              "content_editor",
              "read_only",
              "super_admin",
            ])
          );

        const foundKeys = new Set(roleRows.map((r) => r.key));
        expect(foundKeys.has("workspace_owner")).toBe(true);
        expect(foundKeys.has("content_editor")).toBe(true);
        expect(foundKeys.has("read_only")).toBe(true);
        expect(foundKeys.has("super_admin")).toBe(true);
      });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // WORKSPACE_OWNER TESTS
    // ─────────────────────────────────────────────────────────────────────────

    describe("workspace_owner role", () => {
      test("has all CMS content write permissions", async () => {
        for (const actionKey of CMS_CONTENT_WRITE_PERMISSIONS) {
          const allowed = await checkPermission(
            OWNER_USER_ID,
            TEST_WORKSPACE_ID,
            actionKey
          );
          expect(allowed).toBe(true);
        }
      }, 15_000);

      test("has all CMS content read permissions", async () => {
        for (const actionKey of CMS_CONTENT_READ_PERMISSIONS) {
          const allowed = await checkPermission(
            OWNER_USER_ID,
            TEST_WORKSPACE_ID,
            actionKey
          );
          expect(allowed).toBe(true);
        }
      }, 15_000);

      test("has cms.comments.moderate permission", async () => {
        const allowed = await checkPermission(
          OWNER_USER_ID,
          TEST_WORKSPACE_ID,
          "cms.comments.moderate"
        );
        expect(allowed).toBe(true);
      });

      test("has all docs permissions", async () => {
        for (const actionKey of [
          ...DOCS_WRITE_PERMISSIONS,
          ...DOCS_READ_PERMISSIONS,
        ]) {
          const allowed = await checkPermission(
            OWNER_USER_ID,
            TEST_WORKSPACE_ID,
            actionKey
          );
          expect(allowed).toBe(true);
        }
      }, 15_000);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // CONTENT_EDITOR TESTS
    // ─────────────────────────────────────────────────────────────────────────

    describe("content_editor role", () => {
      test("has all CMS content write permissions", async () => {
        for (const actionKey of CMS_CONTENT_WRITE_PERMISSIONS) {
          const allowed = await checkPermission(
            EDITOR_USER_ID,
            TEST_WORKSPACE_ID,
            actionKey
          );
          expect(allowed).toBe(true);
        }
      }, 15_000);

      test("has all CMS content read permissions", async () => {
        for (const actionKey of CMS_CONTENT_READ_PERMISSIONS) {
          const allowed = await checkPermission(
            EDITOR_USER_ID,
            TEST_WORKSPACE_ID,
            actionKey
          );
          expect(allowed).toBe(true);
        }
      }, 15_000);

      test("has cms.comments.moderate permission", async () => {
        const allowed = await checkPermission(
          EDITOR_USER_ID,
          TEST_WORKSPACE_ID,
          "cms.comments.moderate"
        );
        expect(allowed).toBe(true);
      });

      test("has all docs permissions", async () => {
        for (const actionKey of [
          ...DOCS_WRITE_PERMISSIONS,
          ...DOCS_READ_PERMISSIONS,
        ]) {
          const allowed = await checkPermission(
            EDITOR_USER_ID,
            TEST_WORKSPACE_ID,
            actionKey
          );
          expect(allowed).toBe(true);
        }
      }, 15_000);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // READ_ONLY TESTS
    // ─────────────────────────────────────────────────────────────────────────

    describe("read_only role", () => {
      test("has CMS content read permissions", async () => {
        for (const actionKey of CMS_CONTENT_READ_PERMISSIONS) {
          const allowed = await checkPermission(
            READONLY_USER_ID,
            TEST_WORKSPACE_ID,
            actionKey
          );
          expect(allowed).toBe(true);
        }
      }, 15_000);

      test("has docs.document.read permission", async () => {
        const allowed = await checkPermission(
          READONLY_USER_ID,
          TEST_WORKSPACE_ID,
          "docs.document.read"
        );
        expect(allowed).toBe(true);
      });

      test("does NOT have CMS content write permissions", async () => {
        for (const actionKey of CMS_CONTENT_WRITE_PERMISSIONS) {
          const allowed = await checkPermission(
            READONLY_USER_ID,
            TEST_WORKSPACE_ID,
            actionKey
          );
          expect(allowed).toBe(false);
        }
      }, 15_000);

      test("does NOT have cms.comments.moderate permission", async () => {
        const allowed = await checkPermission(
          READONLY_USER_ID,
          TEST_WORKSPACE_ID,
          "cms.comments.moderate"
        );
        expect(allowed).toBe(false);
      });

      test("does NOT have docs write permissions", async () => {
        for (const actionKey of DOCS_WRITE_PERMISSIONS) {
          const allowed = await checkPermission(
            READONLY_USER_ID,
            TEST_WORKSPACE_ID,
            actionKey
          );
          expect(allowed).toBe(false);
        }
      }, 15_000);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // CROSS-WORKSPACE ISOLATION
    // ─────────────────────────────────────────────────────────────────────────

    describe("workspace isolation", () => {
      test("user has no permissions in unassigned workspace", async () => {
        const OTHER_WORKSPACE_ID = randomUUID();

        for (const actionKey of [
          ...CMS_CONTENT_WRITE_PERMISSIONS,
          ...DOCS_WRITE_PERMISSIONS,
        ]) {
          const allowed = await checkPermission(
            OWNER_USER_ID,
            OTHER_WORKSPACE_ID,
            actionKey
          );
          expect(allowed).toBe(false);
        }
      }, 15_000);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // UNKNOWN USER/ACTION
    // ─────────────────────────────────────────────────────────────────────────

    describe("edge cases", () => {
      test("unknown user returns false", async () => {
        const allowed = await checkPermission(
          randomUUID(),
          TEST_WORKSPACE_ID,
          "cms.content_entry.create"
        );
        expect(allowed).toBe(false);
      });

      test("unknown action returns false", async () => {
        const allowed = await checkPermission(
          OWNER_USER_ID,
          TEST_WORKSPACE_ID,
          "unknown.action.key"
        );
        expect(allowed).toBe(false);
      });
    });
  }
);
