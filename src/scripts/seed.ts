import { db } from "../db";
import { permissions, roles, rolePermissions } from "../db/schema";
import { eq } from "drizzle-orm";

const SEED_PERMISSIONS = [
  { key: "docs.document.create", description: "Create documents" },
  { key: "docs.document.read", description: "Read documents" },
  { key: "cms.blog_entry.create", description: "Create blog entries" },
  { key: "cms.blog_entry.read", description: "Read blog entries" },
];

const SUPER_ADMIN_ROLE_KEY = "super_admin";

async function main() {
  console.log("Seeding database...");

  // 1. Insert Permissions
  console.log("Inserting permissions...");
  const insertedPermissions = await db
    .insert(permissions)
    .values(SEED_PERMISSIONS)
    .onConflictDoNothing()
    .returning();

  // If returning none (already existed), fetch them
  const allPermissions = await db.select().from(permissions);
  
  // 2. Insert Super Admin Role
  console.log("Inserting super_admin role...");
  const [superAdminRole] = await db
    .insert(roles)
    .values({
      key: SUPER_ADMIN_ROLE_KEY,
      description: "Super Admin with all permissions",
    })
    .onConflictDoUpdate({
      target: roles.key,
      set: { description: "Super Admin with all permissions" },
    })
    .returning();
  
  // If undefined query again
  const targetRole = superAdminRole || (await db.query.roles.findFirst({ where: eq(roles.key, SUPER_ADMIN_ROLE_KEY) }));

  if (!targetRole) {
      throw new Error("Failed to create or find super_admin role");
  }

  // 3. Assign all permissions to Super Admin
  console.log("Assigning permissions to super_admin...");
  const rolePermissionValues = allPermissions.map((p) => ({
    roleId: targetRole.id,
    permissionId: p.id,
  }));

  if (rolePermissionValues.length > 0) {
      await db
        .insert(rolePermissions)
        .values(rolePermissionValues)
        .onConflictDoNothing();
  }

  console.log("Seeding complete!");
  process.exit(0);
}

main().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
