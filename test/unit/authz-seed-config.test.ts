import { describe, expect, test } from "bun:test";
import { AUTHZ_PERMISSIONS, AUTHZ_ROLES } from "../../src/db/seed/authz.seed";

describe("Authz seed config (Unit)", () => {
  const newPermissionKeys = [
    "accounts.workspaces.create",
    "accounts.workspaces.listForUser",
    "docs.document.update",
    "docs.document.listByWorkspace",
    "cms.blog_entry.listAdmin",
    "cms.blog_entry.updateMeta",
    "cms.content.create",
    "cms.content.listPublished",
    "cms.content.getPublishedBySlug",
    "cms.templates.listGlobal",
    "cms.content_types.listForWorkspace",
  ] as const;

  test("permission keys are unique", () => {
    const keys = AUTHZ_PERMISSIONS.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test("includes new permission keys", () => {
    const keys = new Set(AUTHZ_PERMISSIONS.map((p) => p.key));
    for (const key of newPermissionKeys) expect(keys.has(key)).toBe(true);
  });

  test("workspace_owner has all new permissions", () => {
    const owner = AUTHZ_ROLES.find((r) => r.key === "workspace_owner");
    expect(owner).toBeTruthy();
    for (const key of newPermissionKeys)
      expect(owner?.permissions.includes(key)).toBe(true);
  });

  test("content_editor has all new permissions", () => {
    const editor = AUTHZ_ROLES.find((r) => r.key === "content_editor");
    expect(editor).toBeTruthy();
    for (const key of newPermissionKeys)
      expect(editor?.permissions.includes(key)).toBe(true);
  });

  test("includes workspace_member role", () => {
    const member = AUTHZ_ROLES.find((r) => r.key === "workspace_member");
    expect(member).toBeTruthy();
  });

  test("read_only only gets list/introspect permissions", () => {
    const readOnly = AUTHZ_ROLES.find((r) => r.key === "read_only");
    expect(readOnly).toBeTruthy();

    expect(
      readOnly?.permissions.includes("docs.document.listByWorkspace")
    ).toBe(true);
    expect(readOnly?.permissions.includes("cms.content.listPublished")).toBe(
      true
    );
    expect(
      readOnly?.permissions.includes("cms.content.getPublishedBySlug")
    ).toBe(true);
    expect(readOnly?.permissions.includes("cms.templates.listGlobal")).toBe(
      true
    );
    expect(
      readOnly?.permissions.includes("cms.content_types.listForWorkspace")
    ).toBe(true);
    expect(
      readOnly?.permissions.includes("accounts.workspaces.listForUser")
    ).toBe(true);

    expect(readOnly?.permissions.includes("cms.blog_entry.listAdmin")).toBe(
      false
    );
    expect(readOnly?.permissions.includes("docs.document.update")).toBe(false);
    expect(readOnly?.permissions.includes("cms.blog_entry.updateMeta")).toBe(
      false
    );
    expect(readOnly?.permissions.includes("cms.content.create")).toBe(false);
    expect(readOnly?.permissions.includes("accounts.workspaces.create")).toBe(
      false
    );
  });
});
