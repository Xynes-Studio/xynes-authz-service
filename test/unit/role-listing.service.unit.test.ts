import { describe, expect, test } from "bun:test";
import { listRolesForWorkspace } from "../../src/services/role-listing.service";

class FakeDb {
  constructor(private rows: Array<{ userId: string; roleKey: string }>) {}

  select(_: Record<string, unknown>) {
    return {
      from: (_table: unknown) => ({
        where: async (_where: unknown) => this.rows,
      }),
    };
  }
}

describe("listRolesForWorkspace (unit)", () => {
  test("returns roles for workspace", async () => {
    const rows = [
      { userId: "user-1", roleKey: "workspace_owner" },
      { userId: "user-2", roleKey: "workspace_member" },
    ];
    const fakeDb = new FakeDb(rows);

    const result = await listRolesForWorkspace(
      { workspaceId: "workspace-1", userIds: ["user-1", "user-2"] },
      { db: fakeDb as unknown as typeof import("../../src/db").db },
    );

    expect(result).toEqual(rows);
  });
});
