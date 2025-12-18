import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import type { AuthzDb } from "../../src/db/seed/authz.seed";
import { AUTHZ_PERMISSIONS, seedAuthz } from "../../src/db/seed/authz.seed";
import * as schema from "../../src/db/schema";

type PermissionRow = { id: string; key: string; description: string | null };
type RoleRow = { id: string; key: string; description: string | null };

type AuthzSeedDb = {
  permissions: Map<string, PermissionRow>;
  roles: Map<string, RoleRow>;
  rolePermissions: Set<string>;
};

function collectSqlParams(sqlLike: unknown, out: unknown[] = []) {
  if (!sqlLike || typeof sqlLike !== "object") return out;
  const maybeQueryChunks = sqlLike as { queryChunks?: unknown[] };
  if (Array.isArray(maybeQueryChunks.queryChunks)) {
    for (const chunk of maybeQueryChunks.queryChunks) collectSqlParams(chunk, out);
    return out;
  }
  if (Array.isArray(sqlLike)) {
    for (const item of sqlLike) collectSqlParams(item, out);
    return out;
  }
  const maybeParam = sqlLike as { value?: unknown; constructor?: { name?: string } };
  if (maybeParam.constructor?.name === "Param" && "value" in maybeParam) {
    out.push(maybeParam.value);
  }
  return out;
}

function isIdKeySelection(selection: unknown): selection is { id: unknown; key: unknown } {
  return Boolean((selection as { id?: unknown })?.id && (selection as { key?: unknown })?.key);
}

function upsertPermissions(db: AuthzSeedDb, valuesPayload: unknown) {
  const rows = Array.isArray(valuesPayload) ? valuesPayload : [valuesPayload];
  for (const row of rows) {
    const permission = row as { key: string; description?: string | null };
    const existing = db.permissions.get(permission.key);
    if (existing) {
      existing.description = permission.description ?? null;
      continue;
    }
    db.permissions.set(permission.key, {
      id: randomUUID(),
      key: permission.key,
      description: permission.description ?? null,
    });
  }
}

function upsertRole(db: AuthzSeedDb, valuesPayload: unknown): RoleRow {
  const role = valuesPayload as { key: string; description?: string | null };
  const existing = db.roles.get(role.key);
  if (existing) {
    existing.description = role.description ?? null;
    return existing;
  }

  const created: RoleRow = {
    id: randomUUID(),
    key: role.key,
    description: role.description ?? null,
  };
  db.roles.set(role.key, created);
  return created;
}

function insertRolePermissions(db: AuthzSeedDb, valuesPayload: unknown) {
  const rows = Array.isArray(valuesPayload) ? valuesPayload : [valuesPayload];
  for (const row of rows) {
    const entry = row as { roleId: string; permissionId: string };
    db.rolePermissions.add(`${entry.roleId}|${entry.permissionId}`);
  }
}

class FakeAuthzDb {
  permissions = new Map<string, PermissionRow>();
  roles = new Map<string, RoleRow>();
  rolePermissions = new Set<string>();

  query = {
    roles: {
      findFirst: async () => {
        throw new Error("FakeAuthzDb: unexpected query.roles.findFirst call");
      },
    },
  };

  insert(table: unknown) {
    const dbState: AuthzSeedDb = this;

    return {
      values(valuesPayload: unknown) {
        if (table === schema.permissions) {
          return {
            async onConflictDoUpdate(_: unknown) {
              upsertPermissions(dbState, valuesPayload);
            },
          };
        }

        if (table === schema.roles) {
          return {
            onConflictDoUpdate(_: unknown) {
              const role = upsertRole(dbState, valuesPayload);
              return {
                async returning() {
                  return [role];
                },
              };
            },
          };
        }

        if (table === schema.rolePermissions) {
          return {
            async onConflictDoNothing() {
              insertRolePermissions(dbState, valuesPayload);
            },
          };
        }

        throw new Error("FakeAuthzDb: unsupported insert table");
      },
    };
  }

  select(selection: unknown) {
    const dbState: AuthzSeedDb = this;

    return {
      from(table: unknown) {
        return {
          async where(_: unknown) {
            if (table === schema.permissions) {
              const rows = [...dbState.permissions.values()];
              if (isIdKeySelection(selection)) return rows.map((r) => ({ id: r.id, key: r.key }));
              return rows;
            }

            if (table === schema.roles) {
              const rows = [...dbState.roles.values()];
              if (isIdKeySelection(selection)) return rows.map((r) => ({ id: r.id, key: r.key }));
              return rows;
            }

            throw new Error("FakeAuthzDb: unsupported select table");
          },
        };
      },
    };
  }

  delete(table: unknown) {
    const dbState: AuthzSeedDb = this;
    return {
      async where(whereClause: unknown) {
        if (table !== schema.rolePermissions) throw new Error("FakeAuthzDb: unsupported delete table");

        const params = collectSqlParams(whereClause)
          .filter((v): v is string => typeof v === "string" && v.length > 0);
        const [roleId, ...rest] = params;
        if (!roleId) return;

        const permissionId = rest[0];
        if (permissionId) {
          dbState.rolePermissions.delete(`${roleId}|${permissionId}`);
          return;
        }

        for (const entry of [...dbState.rolePermissions]) {
          if (entry.startsWith(`${roleId}|`)) dbState.rolePermissions.delete(entry);
        }
      },
    };
  }
}

describe("seedAuthz (Unit, in-memory DB)", () => {
  test("upserts permissions and role-permission mappings idempotently", async () => {
    const db = new FakeAuthzDb();

    await seedAuthz({ db: db as unknown as AuthzDb });
    const permissionCountAfterFirst = db.permissions.size;
    const rolePermissionCountAfterFirst = db.rolePermissions.size;

    await seedAuthz({ db: db as unknown as AuthzDb });
    expect(db.permissions.size).toBe(permissionCountAfterFirst);
    expect(db.rolePermissions.size).toBe(rolePermissionCountAfterFirst);

    for (const permission of AUTHZ_PERMISSIONS) {
      expect(db.permissions.has(permission.key)).toBe(true);
    }

    const ownerRole = db.roles.get("workspace_owner");
    const editorRole = db.roles.get("content_editor");
    const readOnlyRole = db.roles.get("read_only");
    expect(ownerRole).toBeTruthy();
    expect(editorRole).toBeTruthy();
    expect(readOnlyRole).toBeTruthy();

    const permIdByKey = new Map([...db.permissions.values()].map((p) => [p.key, p.id]));
    const has = (roleKey: string, permissionKey: string) => {
      const roleId = db.roles.get(roleKey)?.id;
      const permissionId = permIdByKey.get(permissionKey);
      if (!roleId || !permissionId) return false;
      return db.rolePermissions.has(`${roleId}|${permissionId}`);
    };

    expect(has("workspace_owner", "cms.content.create")).toBe(true);
    expect(has("content_editor", "cms.content.create")).toBe(true);
    expect(has("read_only", "cms.content.create")).toBe(false);

    expect(has("workspace_owner", "cms.content.listPublished")).toBe(true);
    expect(has("content_editor", "cms.content.listPublished")).toBe(true);
    expect(has("read_only", "cms.content.listPublished")).toBe(true);

    expect(has("workspace_owner", "cms.content.getPublishedBySlug")).toBe(true);
    expect(has("content_editor", "cms.content.getPublishedBySlug")).toBe(true);
    expect(has("read_only", "cms.content.getPublishedBySlug")).toBe(true);
  });

  test("removes cms.blog_entry.listAdmin from read_only on reseed", async () => {
    const db = new FakeAuthzDb();
    await seedAuthz({ db: db as unknown as AuthzDb });

    const readOnlyRoleId = db.roles.get("read_only")?.id;
    expect(readOnlyRoleId).toBeTruthy();

    const listAdminPermId = [...db.permissions.values()].find((p) => p.key === "cms.blog_entry.listAdmin")?.id;
    expect(listAdminPermId).toBeTruthy();

    db.rolePermissions.add(`${readOnlyRoleId}|${listAdminPermId}`);
    expect(db.rolePermissions.has(`${readOnlyRoleId}|${listAdminPermId}`)).toBe(true);

    await seedAuthz({ db: db as unknown as AuthzDb });
    expect(db.rolePermissions.has(`${readOnlyRoleId}|${listAdminPermId}`)).toBe(false);
  });
});
