import { userRoles } from "../db/schema";

export type AssignRoleInput = {
  userId: string;
  workspaceId: string;
  roleKey: "workspace_owner" | "workspace_member";
};

export async function assignRole(input: AssignRoleInput): Promise<void> {
  const { db } = await import("../db");

  await db
    .insert(userRoles)
    .values({
      userId: input.userId,
      workspaceId: input.workspaceId,
      roleKey: input.roleKey,
    })
    .onConflictDoNothing();
}
