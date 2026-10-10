import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import postgres from "postgres";
import { db } from "../../src/db";
import { seedAuthz } from "../../src/db/seed/authz.seed";
import {
  cmsDeliveryPlanDigest,
  planCmsDeliveryGrants,
  readCmsDeliveryCatalog,
  reconcileCmsDeliveryGrants,
} from "../../src/db/seed/cms-delivery-reconciliation";
import {
  runCmsDeliveryCli,
  runCmsDeliveryReconciliation,
} from "../../src/scripts/reconcile-cms-delivery";
import { checkPermission } from "../../src/services/authz.service";

const obsoletePrefix = "fixture.obsolete." + crypto.randomUUID() + ".";
const customRole = "cms-fixture-custom-" + crypto.randomUUID();
const enabled = process.env.RUN_CMS_RBAC_RECONCILIATION_TESTS === "true";
describe.skipIf(!enabled)(
  "explicit scoped RBAC deployment reconciliation (isolated PostgreSQL)",
  () => {
    let sql: ReturnType<typeof postgres>;
    let target: { host: string; port: string; database: string };
    const workspace = crypto.randomUUID(),
      foreign = crypto.randomUUID(),
      owner = crypto.randomUUID(),
      member = crypto.randomUUID();
    beforeAll(async () => {
      const url = new URL(process.env.DATABASE_URL ?? "");
      if (
        !["postgres:", "postgresql:"].includes(url.protocol) ||
        !["127.0.0.1", "localhost"].includes(url.hostname) ||
        url.search ||
        url.hash ||
        !/^\/cms_int_a4_[a-z0-9_]+$/.test(url.pathname)
      )
        throw new Error("Explicit disposable cms_int_a4_* database required");
      target = {
        host: url.hostname,
        port: url.port || "5432",
        database: url.pathname.slice(1),
      };
      sql = postgres(url.href, { max: 1, prepare: false, onnotice: () => {} });
      await seedAuthz({ db });
    });
    afterAll(async () => {
      if (sql) await sql.end();
    });
    const plan = async () =>
      planCmsDeliveryGrants(await readCmsDeliveryCatalog(sql), target);
    it("CLI defaults to a read-only report, validates arguments and redacts connection failures", async () => {
      const before = cmsDeliveryPlanDigest(await plan());
      const report = await runCmsDeliveryReconciliation(
        [],
        process.env.DATABASE_URL,
      );
      expect(report.mode).toBe("dry-run");
      expect(cmsDeliveryPlanDigest(await plan())).toBe(before);
      await expect(
        runCmsDeliveryReconciliation(["--apply"], process.env.DATABASE_URL),
      ).rejects.toThrow("Usage:");
      await expect(runCmsDeliveryReconciliation([], "")).rejects.toThrow(
        "DATABASE_URL",
      );
      const errors: string[] = [];
      expect(
        await runCmsDeliveryCli(
          ["bad"],
          "postgres://fixture:private-fixture-secret@127.0.0.1:1/db",
          { log: () => {}, error: (value) => errors.push(String(value)) },
        ),
      ).toBe(1);
      expect(errors.join(" ")).not.toContain("private-fixture-secret");
      const reports: string[] = [];
      expect(
        await runCmsDeliveryCli(["--dry-run"], process.env.DATABASE_URL, {
          log: (value) => reports.push(String(value)),
          error: () => {
            throw new Error("Unexpected CLI error");
          },
        }),
      ).toBe(0);
      expect(reports.join(" ")).toContain('"mode": "dry-run"');
    });
    it("fresh installs converge; upgraded catalogs need explicit reconciliation; a second run is a no-op", async () => {
      expect((await plan()).additions).toEqual([]);
      await sql`insert into authz.user_roles(user_id,workspace_id,role_key) values(${owner},${workspace},'workspace_owner'),(${member},${workspace},'workspace_member')`;
      await sql`insert into authz.roles(key) values(${customRole})`;
      await sql`insert into authz.role_permissions(role_id,permission_id) select r.id,p.id from authz.roles r cross join authz.permissions p where r.key=${customRole} and p.key='cms.delivery.getById'`;
      await sql`delete from authz.role_permissions rp using authz.permissions p,authz.roles r where rp.permission_id=p.id and rp.role_id=r.id and p.key in ('cms.delivery.listByDirectory','cms.delivery.getById') and r.key in ('workspace_owner','content_editor','read_only','super_admin')`;
      await sql`delete from authz.role_permissions rp using authz.permissions p,authz.roles r where rp.permission_id=p.id and rp.role_id=r.id and p.key='accounts.invites.resend' and r.key='workspace_owner'`;
      // Simulate an upgrade missing the two new catalog records while retaining
      // every historical/custom permission row and its existing grant IDs.
      await sql`update authz.permissions set key=${obsoletePrefix} || key where key in ('cms.delivery.listByDirectory','cms.delivery.getById')`;
      const beforeUsers = JSON.stringify(
        await sql`select * from authz.user_roles order by user_id,workspace_id,role_key`,
      );
      const beforeCustom = JSON.stringify(
        await sql`select rp.* from authz.role_permissions rp join authz.roles r on r.id=rp.role_id where r.key=${customRole}`,
      );
      const upgraded = await plan();
      expect(upgraded.missingPermissions).toHaveLength(2);
      expect(upgraded.additions).toHaveLength(8);
      // RED state: expected grants are absent despite existing owner/member rows.
      expect(
        await checkPermission(owner, workspace, "cms.delivery.getById"),
      ).toBe(false);
      await expect(
        reconcileCmsDeliveryGrants(sql, target, "bad"),
      ).rejects.toThrow("reviewed plan");
      await expect(
        reconcileCmsDeliveryGrants(sql, target, "0".repeat(64)),
      ).rejects.toThrow("Catalog changed");
      expect(cmsDeliveryPlanDigest(await plan())).toBe(
        cmsDeliveryPlanDigest(upgraded),
      );
      const audit = await reconcileCmsDeliveryGrants(
        sql,
        target,
        cmsDeliveryPlanDigest(upgraded),
      );
      expect(audit.createdPermissions).toHaveLength(2);
      expect(audit.inserted).toHaveLength(8);
      expect(audit.remaining).toEqual([]);
      expect(
        await checkPermission(owner, workspace, "cms.delivery.getById"),
      ).toBe(true);
      expect(
        await checkPermission(owner, foreign, "cms.delivery.getById"),
      ).toBe(false);
      expect(
        await checkPermission(member, workspace, "cms.delivery.getById"),
      ).toBe(false);
      expect(
        await checkPermission(owner, workspace, "accounts.invites.resend"),
      ).toBe(false);
      expect(
        JSON.stringify(
          await sql`select * from authz.user_roles order by user_id,workspace_id,role_key`,
        ),
      ).toBe(beforeUsers);
      expect(
        JSON.stringify(
          await sql`select rp.* from authz.role_permissions rp join authz.roles r on r.id=rp.role_id where r.key=${customRole}`,
        ),
      ).toBe(beforeCustom);
      const after = await plan();
      expect(after.additions).toEqual([]);
      const second = await reconcileCmsDeliveryGrants(
        sql,
        target,
        cmsDeliveryPlanDigest(after),
      );
      expect(second.inserted).toEqual([]);
      const cliAudit = await runCmsDeliveryReconciliation(
        ["--apply", cmsDeliveryPlanDigest(await plan())],
        process.env.DATABASE_URL,
      );
      expect(cliAudit.mode).toBe("applied");
      await expect(
        reconcileCmsDeliveryGrants(
          sql,
          target,
          cmsDeliveryPlanDigest(upgraded),
        ),
      ).rejects.toThrow("Catalog changed");
      // Scoped reversal removes only the additions this audit actually inserted.
      for (const row of audit.inserted)
        await sql`delete from authz.role_permissions where role_id=${row.roleId} and permission_id=${row.permissionId}`;
      expect((await plan()).additions).toHaveLength(8);
      expect(
        JSON.stringify(
          await sql`select * from authz.user_roles order by user_id,workspace_id,role_key`,
        ),
      ).toBe(beforeUsers);
    });
  },
);
