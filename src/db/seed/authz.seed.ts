/**
 * AUTHZ Seeding Functions
 *
 * Idempotent seed logic for RBAC permissions and role mappings.
 * Safe to run multiple times.
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema";
import {
  AUTHZ_PERMISSIONS,
  AUTHZ_ROLES,
  type PermissionKey,
} from "./permissions.config";

// Type for the database with schema
export type AuthzDb = PostgresJsDatabase<typeof schema>;

// Re-export config for convenience
export { AUTHZ_PERMISSIONS, AUTHZ_ROLES };
export type { PermissionKey };

/**
 * Seeds the authz schema with permissions and role mappings.
 * This function is idempotent - safe to call multiple times.
 *
 * @param options.db - The database connection
 */
export async function seedAuthz({ db }: { db: AuthzDb }) {
  // 1. Upsert all permissions
  await db
    .insert(schema.permissions)
    .values(
      AUTHZ_PERMISSIONS.map((p) => ({ key: p.key, description: p.description }))
    )
    .onConflictDoUpdate({
      target: schema.permissions.key,
      set: { description: sql`excluded.description` },
    });

  // 2. Fetch permission IDs for mapping
  const permissionKeys = AUTHZ_PERMISSIONS.map((p) => p.key);
  const permissionRows = await db
    .select({ id: schema.permissions.id, key: schema.permissions.key })
    .from(schema.permissions)
    .where(inArray(schema.permissions.key, permissionKeys));

  const permissionIdByKey = new Map(permissionRows.map((p) => [p.key, p.id]));

  // 3. Upsert roles and their permission mappings
  for (const roleConfig of AUTHZ_ROLES) {
    const [role] = await db
      .insert(schema.roles)
      .values({ key: roleConfig.key, description: roleConfig.description })
      .onConflictDoUpdate({
        target: schema.roles.key,
        set: { description: roleConfig.description },
      })
      .returning();

    // Handle case where returning() doesn't work (e.g., no update)
    const resolvedRoleId =
      role?.id ??
      (
        await db.query.roles.findFirst({
          where: eq(schema.roles.key, roleConfig.key),
        })
      )?.id;

    if (!resolvedRoleId) {
      throw new Error(`Failed to upsert role: ${roleConfig.key}`);
    }

    // Build role-permission mapping values
    const rolePermissionValues = roleConfig.permissions
      .map((permKey) => {
        const permissionId = permissionIdByKey.get(permKey);
        if (!permissionId) {
          console.warn(
            `Permission key "${permKey}" not found for role "${roleConfig.key}"`
          );
          return null;
        }
        return { roleId: resolvedRoleId, permissionId };
      })
      .filter((v): v is { roleId: string; permissionId: string } => v !== null);

    // Insert role-permission mappings (idempotent)
    if (rolePermissionValues.length > 0) {
      await db
        .insert(schema.rolePermissions)
        .values(rolePermissionValues)
        .onConflictDoNothing();
    }

    const removePermissionsFromRole = async (
      roleId: string,
      permissionKeysToRemove: readonly PermissionKey[],
    ) => {
      const permissionIdsToRemove = permissionKeysToRemove
        .map((permissionKey) => permissionIdByKey.get(permissionKey))
        .filter((permissionId): permissionId is string => Boolean(permissionId));

      if (permissionIdsToRemove.length === 0) {
        return;
      }

      await db
        .delete(schema.rolePermissions)
        .where(
          and(
            eq(schema.rolePermissions.roleId, roleId),
            inArray(schema.rolePermissions.permissionId, permissionIdsToRemove),
          ),
        );
    };

    // Special handling: ensure read_only doesn't have admin permissions
    // (defensive cleanup in case of manual additions)
    if (roleConfig.key === "read_only") {
      const adminPermissions = [
        "cms.blog_entry.listAdmin",
        "cms.content_type.manage",
        "cms.content_entry.create",
        "cms.content_entry.update",
        "cms.content_entry.publish",
        "cms.entry.create",
        "cms.entry.update",
        "cms.entry.delete",
        "cms.entry.publish",
        "cms.entry.collaborators.set",
        "cms.entry.favorite.toggle",
        "cms.entry.share.generateInternalLink",
        "cms.content_directories.create",
        "cms.content_directories.update",
        "cms.content_directories.delete",
        "cms.comments.moderate",
        "docs.document.create",
        "docs.document.update",
        "telemetry.events.view",
        "telemetry.events.listRecentForWorkspace",
        "telemetry.stats.summaryByRoute",
      ] as const;
      await removePermissionsFromRole(resolvedRoleId, adminPermissions);
    }

    // Owner-only guardrail: content_editor must not retain directory write permissions.
    // This makes reseeding corrective for environments where these permissions
    // were previously granted.
    if (roleConfig.key === "content_editor") {
      await removePermissionsFromRole(resolvedRoleId, [
        "cms.content_directories.create",
        "cms.content_directories.update",
        "cms.content_directories.delete",
      ] as const);
    }
  }
}
