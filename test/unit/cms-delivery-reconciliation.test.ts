import { describe, expect, it } from "bun:test";
import {
  CMS_DELIVERY_PERMISSION_KEYS,
  type CmsDeliveryCatalog,
  cmsDeliveryPlanDigest,
  planCmsDeliveryGrants,
} from "../../src/db/seed/cms-delivery-reconciliation";

const target = {
  host: "127.0.0.1",
  port: "65432",
  database: "cms_int_a4_epic",
};
function catalog(): CmsDeliveryCatalog {
  return {
    roles: [
      "workspace_owner",
      "workspace_member",
      "content_editor",
      "read_only",
      "super_admin",
      "custom",
    ].map((key, id) => ({ id: String(id), key })),
    permissions: CMS_DELIVERY_PERMISSION_KEYS.map((key, id) => ({
      id: String(id),
      key,
    })),
    grants: [],
  };
}
function existingCatalogGrants(plan: ReturnType<typeof planCmsDeliveryGrants>) {
  return plan.additions.map((grant) => {
    if (grant.permissionId === null) {
      throw new Error("Test catalog must already contain the permission");
    }
    return { ...grant, permissionId: grant.permissionId };
  });
}
describe("scoped CMS delivery reconciliation plan", () => {
  it("finds exactly eight delivery additions without expanding Member or custom roles", () => {
    const plan = planCmsDeliveryGrants(catalog(), target);
    expect(
      plan.additions.map((row) => `${row.roleKey}:${row.permissionKey}`).sort(),
    ).toEqual(
      ["workspace_owner", "content_editor", "read_only", "super_admin"]
        .flatMap((role) =>
          CMS_DELIVERY_PERMISSION_KEYS.map((key) => `${role}:${key}`),
        )
        .sort(),
    );
    expect(plan.removals).toEqual([]);
    expect(plan.missingRoles).toEqual([]);
    expect(plan.missingPermissions).toEqual([]);
  });
  it("reports missing bootstrap catalog records without fabricating IDs", () => {
    const plan = planCmsDeliveryGrants(
      { roles: [], permissions: [], grants: [] },
      target,
    );
    expect(plan.missingRoles).toHaveLength(4);
    expect(plan.missingPermissions).toHaveLength(2);
    expect(plan.additions).toEqual([]);
  });
  it("preserves custom grants and converges to a stable second no-op plan", () => {
    const state = catalog();
    const plan = planCmsDeliveryGrants(state, target);
    const custom = {
      roleId: "5",
      roleKey: "custom",
      permissionId: "0",
      permissionKey: CMS_DELIVERY_PERMISSION_KEYS[0],
    };
    state.grants = [...existingCatalogGrants(plan), custom];
    const after = planCmsDeliveryGrants(state, target);
    expect(after.additions).toEqual([]);
    expect(after.existingGrants).toContainEqual(custom);
    expect(after.removals).toEqual([]);
    state.grants.reverse();
    expect(cmsDeliveryPlanDigest(planCmsDeliveryGrants(state, target))).toBe(
      cmsDeliveryPlanDigest(after),
    );
  });
  it("binds approval to exact target, IDs and current grants", () => {
    const state = catalog();
    const before = planCmsDeliveryGrants(state, target);
    const digest = cmsDeliveryPlanDigest(before);
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(
      cmsDeliveryPlanDigest(
        planCmsDeliveryGrants(state, { ...target, database: "different" }),
      ),
    ).not.toBe(digest);
    state.grants.push(existingCatalogGrants(before)[0]);
    expect(
      cmsDeliveryPlanDigest(planCmsDeliveryGrants(state, target)),
    ).not.toBe(digest);
  });
});
