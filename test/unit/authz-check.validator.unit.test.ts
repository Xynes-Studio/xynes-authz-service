import { describe, expect, test } from "bun:test";
import { authzCheckRequestSchema } from "../../src/validators/authz-check.validator";

describe("authzCheckRequestSchema (unit)", () => {
  test("accepts workspaceId=null for global actions", () => {
    const parsed = authzCheckRequestSchema.safeParse({
      userId: "550e8400-e29b-41d4-a716-446655440001",
      workspaceId: null,
      actionKey: "accounts.workspaces.listForUser",
    });

    expect(parsed.success).toBe(true);
  });
});
