import { db } from "../db";
import { permissions, roles, rolePermissions } from "../db/schema";
import { eq } from "drizzle-orm";

const PERMISSIONS_LIST = [
  // Documents
  { key: "docs.document.create", description: "Create documents" },
  { key: "docs.document.read", description: "Read documents" },
  { key: "docs.document.update", description: "Update documents" },
  
  // CMS Blog
  { key: "cms.blog_entry.create", description: "Create blog entries" },
  { key: "cms.blog_entry.read", description: "Read blog entries" },
  { key: "cms.blog_entry.listPublished", description: "List published blog entries" },
  { key: "cms.blog_entry.getPublishedBySlug", description: "Get published blog entry by slug" },
  
  // CMS Comments
  { key: "cms.comments.create", description: "Create comments" },
  { key: "cms.comments.listForEntry", description: "List comments for entry" },
];

const ROLES_CONFIG = [
  {
    key: "workspace_owner",
    description: "Workspace Owner with full access",
    permissions: PERMISSIONS_LIST.map(p => p.key), // All permissions
  },
  {
    key: "content_editor",
    description: "Content Editor",
    permissions: [
      "docs.document.create",
      "docs.document.read",
      "docs.document.update",
      "cms.blog_entry.create",
      "cms.blog_entry.read",
      "cms.blog_entry.listPublished",
      "cms.blog_entry.getPublishedBySlug",
      "cms.comments.create",
      "cms.comments.listForEntry",
    ],
  },
  {
    key: "read_only",
    description: "Read Only User",
    permissions: [
      "docs.document.read",
      "cms.blog_entry.read",
      "cms.blog_entry.listPublished",
      "cms.blog_entry.getPublishedBySlug",
      "cms.comments.listForEntry",
    ],
  },
  // Maintain super_admin for backwards compatibility / system level access if needed
  {
    key: "super_admin",
    description: "Super Admin with all permissions",
    permissions: PERMISSIONS_LIST.map(p => p.key),
  }
];

async function main() {
  console.log("Seeding database...");

  // 1. Insert Permissions
  console.log("Inserting/Updating permissions...");
  const insertedPermissions = await db
    .insert(permissions)
    .values(PERMISSIONS_LIST)
    .onConflictDoNothing()
    .returning();
  
  // Fetch all permissions to get IDs
  const allPermissions = await db.select().from(permissions);
  const permissionMap = new Map(allPermissions.map(p => [p.key, p.id]));

  // 2. Upsert Roles and Assign Permissions
  console.log("Upserting roles and permissions...");

  for (const roleConfig of ROLES_CONFIG) {
      console.log(`Processing role: ${roleConfig.key}`);
      
      // Upsert Role
      const [role] = await db
        .insert(roles)
        .values({
            key: roleConfig.key,
            description: roleConfig.description,
        })
        .onConflictDoUpdate({
            target: roles.key,
            set: { description: roleConfig.description },
        })
        .returning();

      const roleId = role?.id || (await db.query.roles.findFirst({ where: eq(roles.key, roleConfig.key) }))!.id;

      // Prepare role_permissions
      const rolePermissionValues = roleConfig.permissions
        .map(permKey => {
            const permId = permissionMap.get(permKey);
            if (!permId) {
                console.warn(`Warning: Permission ${permKey} not found for role ${roleConfig.key}`);
                return null;
            }
            return {
                roleId: roleId,
                permissionId: permId,
            };
        })
        .filter((x): x is { roleId: string; permissionId: string } => x !== null);

      if (rolePermissionValues.length > 0) {
          await db
            .insert(rolePermissions)
            .values(rolePermissionValues)
            .onConflictDoNothing();
      }
  }

  console.log("Seeding complete!");
  process.exit(0);
}

main().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
