import { and, eq, inArray, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema";

export type AuthzDb = PostgresJsDatabase<typeof schema>;

export const AUTHZ_PERMISSIONS = [
  // Workspaces (global)
  { key: "accounts.workspaces.create", description: "Create workspaces" },
  {
    key: "accounts.workspaces.listForUser",
    description: "List workspaces for user",
  },

  // Documents
  { key: "docs.document.create", description: "Create documents" },
  { key: "docs.document.read", description: "Read documents" },
  { key: "docs.document.update", description: "Update documents" },
  {
    key: "docs.document.listByWorkspace",
    description: "List documents by workspace",
  },

  // CMS Blog
  { key: "cms.blog_entry.create", description: "Create blog entries" },
  { key: "cms.blog_entry.read", description: "Read blog entries" },
  {
    key: "cms.blog_entry.listPublished",
    description: "List published blog entries",
  },
  {
    key: "cms.blog_entry.getPublishedBySlug",
    description: "Get published blog entry by slug",
  },
  { key: "cms.blog_entry.listAdmin", description: "List blog entries (admin)" },
  {
    key: "cms.blog_entry.updateMeta",
    description: "Update blog entry metadata",
  },

  // CMS Generic Content
  { key: "cms.content.create", description: "Create content" },
  { key: "cms.content.listPublished", description: "List published content" },
  {
    key: "cms.content.getPublishedBySlug",
    description: "Get published content by slug",
  },

  // CMS Templates / Content Types
  { key: "cms.templates.listGlobal", description: "List global templates" },
  {
    key: "cms.content_types.listForWorkspace",
    description: "List content types for workspace",
  },

  // CMS Comments
  { key: "cms.comments.create", description: "Create comments" },
  { key: "cms.comments.listForEntry", description: "List comments for entry" },
] as const;

export const AUTHZ_ROLES = [
  {
    key: "workspace_owner",
    description: "Workspace Owner with full access",
    permissions: AUTHZ_PERMISSIONS.map((p) => p.key),
  },
  {
    key: "workspace_member",
    description: "Workspace Member",
    permissions: [],
  },
  {
    key: "content_editor",
    description: "Content Editor",
    permissions: [
      // Documents
      "docs.document.create",
      "docs.document.read",
      "docs.document.update",
      "docs.document.listByWorkspace",

      // CMS Blog
      "cms.blog_entry.create",
      "cms.blog_entry.read",
      "cms.blog_entry.listPublished",
      "cms.blog_entry.getPublishedBySlug",
      "cms.blog_entry.listAdmin",
      "cms.blog_entry.updateMeta",

      // CMS Generic Content
      "cms.content.create",
      "cms.content.listPublished",
      "cms.content.getPublishedBySlug",

      // CMS Templates / Content Types
      "cms.templates.listGlobal",
      "cms.content_types.listForWorkspace",

      // CMS Comments
      "cms.comments.create",
      "cms.comments.listForEntry",

      // Workspaces (global)
      "accounts.workspaces.create",
      "accounts.workspaces.listForUser",
    ],
  },
  {
    key: "read_only",
    description: "Read Only User",
    permissions: [
      // Existing read-style permissions
      "docs.document.read",
      "cms.blog_entry.read",
      "cms.blog_entry.listPublished",
      "cms.blog_entry.getPublishedBySlug",
      "cms.comments.listForEntry",

      // New list/introspection permissions
      "docs.document.listByWorkspace",
      "cms.content.listPublished",
      "cms.content.getPublishedBySlug",
      "cms.templates.listGlobal",
      "cms.content_types.listForWorkspace",

      // Workspaces (global)
      "accounts.workspaces.listForUser",
    ],
  },
  {
    key: "super_admin",
    description: "Super Admin with all permissions",
    permissions: AUTHZ_PERMISSIONS.map((p) => p.key),
  },
] as const;

export async function seedAuthz({ db }: { db: AuthzDb }) {
  await db
    .insert(schema.permissions)
    .values(AUTHZ_PERMISSIONS)
    .onConflictDoUpdate({
      target: schema.permissions.key,
      set: { description: sql`excluded.description` },
    });

  const permissionKeys = AUTHZ_PERMISSIONS.map((p) => p.key);
  const permissionRows = await db
    .select({ id: schema.permissions.id, key: schema.permissions.key })
    .from(schema.permissions)
    .where(inArray(schema.permissions.key, permissionKeys));
  const permissionIdByKey = new Map(permissionRows.map((p) => [p.key, p.id]));

  for (const roleConfig of AUTHZ_ROLES) {
    const [role] = await db
      .insert(schema.roles)
      .values({ key: roleConfig.key, description: roleConfig.description })
      .onConflictDoUpdate({
        target: schema.roles.key,
        set: { description: roleConfig.description },
      })
      .returning();

    const resolvedRoleId =
      role?.id ??
      (
        await db.query.roles.findFirst({
          where: eq(schema.roles.key, roleConfig.key),
        })
      )?.id;
    if (!resolvedRoleId)
      throw new Error(`Failed to upsert role: ${roleConfig.key}`);

    const rolePermissionValues = roleConfig.permissions
      .map((permKey) => {
        const permissionId = permissionIdByKey.get(permKey);
        if (!permissionId) return null;
        return { roleId: resolvedRoleId, permissionId };
      })
      .filter((v): v is { roleId: string; permissionId: string } => v !== null);

    if (rolePermissionValues.length > 0) {
      await db
        .insert(schema.rolePermissions)
        .values(rolePermissionValues)
        .onConflictDoNothing();
    }

    if (roleConfig.key === "read_only") {
      const adminListPermissionId = permissionIdByKey.get(
        "cms.blog_entry.listAdmin"
      );
      if (adminListPermissionId) {
        await db
          .delete(schema.rolePermissions)
          .where(
            and(
              eq(schema.rolePermissions.roleId, resolvedRoleId),
              eq(schema.rolePermissions.permissionId, adminListPermissionId)
            )
          );
      }
    }
  }
}
