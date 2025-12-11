import { db } from "../db";
import { userRoles, rolePermissions, permissions, roles } from "../db/schema";
import { eq, and, inArray } from "drizzle-orm";

export class AuthzService {
    /**
     * Pure function to resolve permission based on roles and permissions map.
     * Useful for unit testing logic without DB.
     */
    static resolvePermission(
        userRoleKeys: string[],
        rolePermissionsMap: Record<string, string[]>, 
        targetPermissionKey: string
    ): boolean {
        // 1. Check super_admin
        if (userRoleKeys.includes("super_admin")) {
            return true;
        }

        // 2. Check specific permissions
        for (const role of userRoleKeys) {
            const perms = rolePermissionsMap[role];
            if (perms && perms.includes(targetPermissionKey)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Checks if a user has a specific permission in a workspace.
     */
    static async checkPermission(userId: string, workspaceId: string, actionKey: string): Promise<boolean> {
        // 1. Fetch user roles in workspace
        const userRolesResult = await db
            .select({
                roleKey: roles.key,
                roleId: roles.id
            })
            .from(userRoles)
            .innerJoin(roles, eq(userRoles.roleId, roles.id))
            .where(and(eq(userRoles.userId, userId), eq(userRoles.workspaceId, workspaceId)));

        const userRoleKeys = userRolesResult.map(r => r.roleKey);
        const userRoleIds = userRolesResult.map(r => r.roleId);

        if (userRoleKeys.length === 0) return false;

        // Optimization: if super_admin is present, return true immediately
        if (userRoleKeys.includes("super_admin")) return true;

        // 2. Check if ANY of the roles has the permission.
        const hasPermission = await db
            .select({ id: permissions.id })
            .from(rolePermissions)
            .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
            .where(
                and(
                    inArray(rolePermissions.roleId, userRoleIds),
                    eq(permissions.key, actionKey)
                )
            )
            .limit(1);

        return hasPermission.length > 0;
    }
}
