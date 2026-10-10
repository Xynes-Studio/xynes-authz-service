import { createHash } from "node:crypto";
import type { Sql } from "postgres";
import { AUTHZ_PERMISSIONS, AUTHZ_ROLES } from "./permissions.config";

export const CMS_DELIVERY_PERMISSION_KEYS = [
  "cms.delivery.listByDirectory",
  "cms.delivery.getById",
] as const;
type CatalogRow = { id: string; key: string };
type GrantRow = {
  roleId: string;
  roleKey: string;
  permissionId: string;
  permissionKey: string;
};
type PlannedGrant = Omit<GrantRow, "permissionId"> & {
  permissionId: string | null;
};
export type CmsDeliveryCatalog = {
  roles: CatalogRow[];
  permissions: CatalogRow[];
  grants: GrantRow[];
};
export type CmsDeliveryTarget = {
  host: string;
  port: string;
  database: string;
};
const desiredRoleKeys = AUTHZ_ROLES.filter((role) =>
  CMS_DELIVERY_PERMISSION_KEYS.every((key) =>
    (role.permissions as readonly string[]).includes(key),
  ),
)
  .map((role) => role.key)
  .sort();
const compare = (
  a: Pick<GrantRow, "roleKey" | "permissionKey">,
  b: Pick<GrantRow, "roleKey" | "permissionKey">,
) =>
  `${a.roleKey}:${a.permissionKey}`.localeCompare(
    `${b.roleKey}:${b.permissionKey}`,
  );

/** Read-only plan; custom grants and user-role assignments are never removed. */
export function planCmsDeliveryGrants(
  catalog: CmsDeliveryCatalog,
  target: CmsDeliveryTarget,
) {
  const missingRoles = desiredRoleKeys.filter(
    (key) => !catalog.roles.some((row) => row.key === key),
  );
  const missingPermissions = CMS_DELIVERY_PERMISSION_KEYS.filter(
    (key) => !catalog.permissions.some((row) => row.key === key),
  );
  const desired: PlannedGrant[] = [];
  for (const roleKey of desiredRoleKeys) {
    const role = catalog.roles.find((row) => row.key === roleKey);
    if (!role) continue;
    for (const permissionKey of CMS_DELIVERY_PERMISSION_KEYS) {
      const permission = catalog.permissions.find(
        (row) => row.key === permissionKey,
      );
      desired.push({
        roleId: role.id,
        roleKey,
        permissionId: permission?.id ?? null,
        permissionKey,
      });
    }
  }
  const grants = catalog.grants
    .filter((row) =>
      (CMS_DELIVERY_PERMISSION_KEYS as readonly string[]).includes(
        row.permissionKey,
      ),
    )
    .sort(compare);
  const missing = desired
    .filter(
      (row) =>
        !grants.some(
          (grant) =>
            grant.roleId === row.roleId &&
            grant.permissionId === row.permissionId,
        ),
    )
    .sort(compare);
  return {
    version: 1,
    target,
    desiredRoleKeys,
    missingRoles,
    missingPermissions,
    permissionsToCreate: AUTHZ_PERMISSIONS.filter((permission) =>
      (missingPermissions as readonly string[]).includes(permission.key),
    ),
    existingGrants: grants,
    additions: missing,
    removals: [],
  };
}

export function cmsDeliveryPlanDigest(
  plan: ReturnType<typeof planCmsDeliveryGrants>,
): string {
  return createHash("sha256").update(JSON.stringify(plan)).digest("hex");
}

export async function readCmsDeliveryCatalog(
  db: Pick<Sql, "unsafe">,
): Promise<CmsDeliveryCatalog> {
  const roles = await db.unsafe<CatalogRow[]>(
    "select id,key from authz.roles order by key",
  );
  const permissions = await db.unsafe<CatalogRow[]>(
    "select id,key from authz.permissions order by key",
  );
  const grants = await db.unsafe<
    GrantRow[]
  >(`select r.id as "roleId",r.key as "roleKey",p.id as "permissionId",p.key as "permissionKey"
    from authz.role_permissions rp join authz.roles r on r.id=rp.role_id join authz.permissions p on p.id=rp.permission_id
    where p.key in ('cms.delivery.listByDirectory','cms.delivery.getById') order by r.key,p.key`);
  return {
    roles: [...roles],
    permissions: [...permissions],
    grants: [...grants],
  };
}

/** Explicit operator step bound to a reviewed plan digest. Never called at startup. */
export async function reconcileCmsDeliveryGrants(
  db: Sql,
  target: CmsDeliveryTarget,
  approvedDigest: string,
) {
  if (!/^[a-f0-9]{64}$/.test(approvedDigest))
    throw new Error("A reviewed plan SHA-256 is required");
  return db.begin("isolation level serializable", async (tx) => {
    await tx.unsafe(
      "select pg_advisory_xact_lock(hashtext('authz:cms-delivery-reconciliation'))",
    );
    const plan = planCmsDeliveryGrants(
      await readCmsDeliveryCatalog(tx),
      target,
    );
    if (cmsDeliveryPlanDigest(plan) !== approvedDigest)
      throw new Error(
        "Catalog changed since approval; prepare a fresh dry-run",
      );
    if (plan.missingRoles.length)
      throw new Error("Initialize the canonical catalog before reconciliation");
    const createdPermissions: CatalogRow[] = [];
    for (const permission of plan.permissionsToCreate) {
      const rows = await tx.unsafe<CatalogRow[]>(
        "insert into authz.permissions(key,description) values($1,$2) on conflict do nothing returning id,key",
        [permission.key, permission.description],
      );
      createdPermissions.push(...rows);
    }
    const resolvedCatalog = await readCmsDeliveryCatalog(tx);
    const inserted: GrantRow[] = [];
    for (const addition of plan.additions) {
      const permissionId = resolvedCatalog.permissions.find(
        (permission) => permission.key === addition.permissionKey,
      )?.id;
      if (!permissionId)
        throw new Error("CMS delivery permission creation failed");
      const rows = await tx.unsafe(
        "insert into authz.role_permissions(role_id,permission_id) values($1,$2) on conflict do nothing returning role_id",
        [addition.roleId, permissionId],
      );
      if (rows.length) inserted.push({ ...addition, permissionId });
    }
    const after = planCmsDeliveryGrants(
      await readCmsDeliveryCatalog(tx),
      target,
    );
    if (after.additions.length)
      throw new Error("CMS delivery reconciliation did not converge");
    return {
      approvedDigest,
      target,
      inserted,
      createdPermissions,
      remaining: after.additions,
      afterDigest: cmsDeliveryPlanDigest(after),
    };
  });
}
