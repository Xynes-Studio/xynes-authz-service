import { userRoles } from "../db/schema";

export type AssignRoleInput = {
  userId: string;
  workspaceId: string;
  roleKey: "workspace_owner" | "workspace_member";
};

type AssignRoleDeps = {
  db?: {
    insert: (table: unknown) => {
      values: (values: unknown) => { onConflictDoNothing: () => Promise<unknown> };
    };
  };
};

export async function assignRole(
  input: AssignRoleInput,
  deps: AssignRoleDeps = {}
): Promise<void> {
  const db = deps.db ?? (await import("../db")).db;

  await db
    .insert(userRoles)
    .values({
      userId: input.userId,
      workspaceId: input.workspaceId,
      roleKey: input.roleKey,
    })
    .onConflictDoNothing();
}
