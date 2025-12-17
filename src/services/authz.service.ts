import { userRoles, rolePermissions, permissions, roles } from "../db/schema";
import { eq, and, inArray } from "drizzle-orm";

type UserRoleRow = { roleKey: string; roleId: string };
type CheckPermissionDeps = {
    fetchUserRoles: (userId: string, workspaceId: string) => Promise<UserRoleRow[]>;
    roleHasPermission: (roleIds: string[], actionKey: string) => Promise<boolean>;
};

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
            if (perms?.includes(targetPermissionKey)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Checks if a user has a specific permission in a workspace.
     */
    static async checkPermission(
        userId: string,
        workspaceId: string,
        actionKey: string,
        deps?: Partial<CheckPermissionDeps>
    ): Promise<boolean> {
        const fetchUserRoles =
            deps?.fetchUserRoles ??
            (async (u: string, w: string) => {
                const { db } = await import("../db");
                return db
                    .select({
                        roleKey: roles.key,
                        roleId: roles.id,
                    })
                    .from(userRoles)
                    .innerJoin(roles, eq(userRoles.roleId, roles.id))
                    .where(and(eq(userRoles.userId, u), eq(userRoles.workspaceId, w)));
            });

        const roleHasPermission =
            deps?.roleHasPermission ??
            (async (roleIds: string[], permissionKey: string) => {
                if (roleIds.length === 0) return false;
                const { db } = await import("../db");
                const rows = await db
                    .select({ id: permissions.id })
                    .from(rolePermissions)
                    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
                    .where(and(inArray(rolePermissions.roleId, roleIds), eq(permissions.key, permissionKey)))
                    .limit(1);
                return rows.length > 0;
            });

        const userRolesResult = await fetchUserRoles(userId, workspaceId);
        const userRoleKeys = userRolesResult.map((r) => r.roleKey);

        if (userRoleKeys.length === 0) return false;
        if (userRoleKeys.includes("super_admin")) return true;

        const userRoleIds = userRolesResult.map((r) => r.roleId);
        return roleHasPermission(userRoleIds, actionKey);
    }
}
