import { describe, expect, test } from "bun:test";
import { resolvePermission } from "../../../src/services/authz.service";

// Unit tests for the pure resolvePermission function (no DB required)
describe("resolvePermission (Pure Unit)", () => {
  test("should allow super_admin", () => {
    const allowed = resolvePermission(["super_admin"], {}, "any.action");
    expect(allowed).toBe(true);
  });

  test("should allow if role has permission", () => {
    const allowed = resolvePermission(
      ["editor"],
      { editor: ["docs.write"] },
      "docs.write"
    );
    expect(allowed).toBe(true);
  });

  test("should deny if role does not have permission", () => {
    const allowed = resolvePermission(
      ["viewer"],
      { viewer: ["docs.read"] },
      "docs.write"
    );
    expect(allowed).toBe(false);
  });

  test("should deny if no roles", () => {
    const allowed = resolvePermission([], {}, "docs.read");
    expect(allowed).toBe(false);
  });

  test("should check multiple roles", () => {
    const allowed = resolvePermission(
      ["viewer", "editor"],
      { viewer: ["docs.read"], editor: ["docs.write"] },
      "docs.write"
    );
    expect(allowed).toBe(true);
  });

  test("should allow super_admin regardless of permissions map", () => {
    const allowed = resolvePermission(
      ["super_admin"],
      { super_admin: [] }, // empty permissions
      "any.action"
    );
    expect(allowed).toBe(true);
  });
});
