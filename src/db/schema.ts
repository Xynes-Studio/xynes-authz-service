import {
  pgSchema,
  text,
  uuid,
  timestamp,
  primaryKey,
} from "drizzle-orm/pg-core";

const authz = pgSchema("authz");

export const permissions = authz.table("permissions", {
  id: uuid("id").defaultRandom().primaryKey(),
  key: text("key").notNull().unique(), // e.g. docs.document.read
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const roles = authz.table("roles", {
  id: uuid("id").defaultRandom().primaryKey(),
  key: text("key").notNull().unique(), // e.g. super_admin, owner
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const rolePermissions = authz.table(
  "role_permissions",
  {
    roleId: uuid("role_id")
      .references(() => roles.id)
      .notNull(),
    permissionId: uuid("permission_id")
      .references(() => permissions.id)
      .notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.roleId, t.permissionId] }),
  })
);

export const userRoles = authz.table(
  "user_roles",
  {
    userId: uuid("user_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    roleKey: text("role_key")
      .references(() => roles.key)
      .notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.workspaceId, t.roleKey] }),
  })
);
