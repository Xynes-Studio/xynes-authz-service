import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { assignRole } from "../../src/services/role-assignment.service";
import { userRoles } from "../../src/db/schema";

describe("assignRole (unit)", () => {
  test("inserts user_roles row and ignores conflicts", async () => {
    const calls: Array<{ table: unknown; values: unknown }> = [];

    const fakeDb = {
      insert: (table: unknown) => ({
        values: (values: unknown) => ({
          onConflictDoNothing: async () => {
            calls.push({ table, values });
            return undefined;
          },
        }),
      }),
    };

    const input = {
      userId: randomUUID(),
      workspaceId: randomUUID(),
      roleKey: "workspace_member" as const,
    };

    await assignRole(input, { db: fakeDb });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.table).toBe(userRoles);
    expect(calls[0]?.values).toEqual(input);
  });
});
