import { and, eq, inArray } from "drizzle-orm";
import { userRoles } from "../db/schema";

export type ListRolesForWorkspaceInput = {
  workspaceId: string;
  userIds?: string[];
};

export type ListRolesForWorkspaceDeps = {
  db?: typeof import("../db").db;
};

export type WorkspaceRoleAssignment = {
  userId: string;
  roleKey: string;
};

export async function listRolesForWorkspace(
  input: ListRolesForWorkspaceInput,
  deps: ListRolesForWorkspaceDeps = {},
): Promise<WorkspaceRoleAssignment[]> {
  const db = deps.db ?? (await import("../db")).db;

  const conditions = [eq(userRoles.workspaceId, input.workspaceId)];
  if (input.userIds && input.userIds.length > 0) {
    conditions.push(inArray(userRoles.userId, input.userIds));
  }

  const rows = await db
    .select({ userId: userRoles.userId, roleKey: userRoles.roleKey })
    .from(userRoles)
    .where(and(...conditions));

  return rows;
}
