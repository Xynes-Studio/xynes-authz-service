import { db } from "../db";
import { permissions, roles, rolePermissions } from "../db/schema";
import { eq } from "drizzle-orm";

const SEED_PERMISSIONS = [
  { key: "docs.document.create", description: "Create documents" },
  { key: "docs.document.read", description: "Read documents" },
  { key: "cms.blog_entry.create", description: "Create blog entries" },
  { key: "cms.blog_entry.read", description: "Read blog entries" },
  // TELE-VIEW-1: Telemetry view permission for admin dashboards
  { key: "telemetry.view", description: "View telemetry events for workspace" },
];

// Role definitions with their permissions
const ROLE_DEFINITIONS = [
  {
    key: "super_admin",
    description: "Super Admin with all permissions",
    // Gets all permissions automatically
    allPermissions: true,
  },
  {
    key: "workspace_owner",
    description: "Workspace Owner with full workspace access",
    // Gets all permissions
    allPermissions: true,
  },
  {
    key: "read_only",
    description: "Read-only access to workspace",
    permissionKeys: [
      "docs.document.read",
      "cms.blog_entry.read",
      // read_only explicitly does NOT get telemetry.view
    ],
  },
];

async function main() {
  console.log("Seeding database...");

  // 1. Insert Permissions
  console.log("Inserting permissions...");
  await db.insert(permissions).values(SEED_PERMISSIONS).onConflictDoNothing();

  // Fetch all permissions for mapping
  const allPermissions = await db.select().from(permissions);
  const permissionsByKey = new Map(allPermissions.map((p) => [p.key, p.id]));

  // 2. Insert all roles and assign permissions
  for (const roleDef of ROLE_DEFINITIONS) {
    console.log(`Processing role: ${roleDef.key}...`);

    const [insertedRole] = await db
      .insert(roles)
      .values({
        key: roleDef.key,
        description: roleDef.description,
      })
      .onConflictDoUpdate({
        target: roles.key,
        set: { description: roleDef.description },
      })
      .returning();

    const targetRole =
      insertedRole ||
      (await db.query.roles.findFirst({ where: eq(roles.key, roleDef.key) }));

    if (!targetRole) {
      throw new Error(`Failed to create or find role: ${roleDef.key}`);
    }

    // Determine which permissions to assign
    let permissionIdsToAssign: string[];
    if ("allPermissions" in roleDef && roleDef.allPermissions) {
      // Assign all permissions
      permissionIdsToAssign = allPermissions.map((p) => p.id);
    } else if ("permissionKeys" in roleDef && roleDef.permissionKeys) {
      // Assign specific permissions
      permissionIdsToAssign = roleDef.permissionKeys
        .map((key) => permissionsByKey.get(key))
        .filter((id): id is string => id !== undefined);
    } else {
      permissionIdsToAssign = [];
    }

    // Insert role-permission mappings
    if (permissionIdsToAssign.length > 0) {
      const rolePermissionValues = permissionIdsToAssign.map(
        (permissionId) => ({
          roleId: targetRole.id,
          permissionId,
        })
      );

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
