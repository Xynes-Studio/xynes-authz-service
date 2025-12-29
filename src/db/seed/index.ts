/**
 * Database Seed Exports
 *
 * Central export for all seed-related functionality.
 */

export { seedAuthz, AUTHZ_PERMISSIONS, AUTHZ_ROLES } from "./authz.seed";
export type { AuthzDb } from "./authz.seed";
export type { PermissionKey, RoleKey } from "./permissions.config";
