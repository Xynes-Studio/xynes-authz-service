import postgres from "postgres";
import {
  cmsDeliveryPlanDigest,
  planCmsDeliveryGrants,
  readCmsDeliveryCatalog,
  reconcileCmsDeliveryGrants,
} from "../db/seed/cms-delivery-reconciliation";

export async function runCmsDeliveryReconciliation(
  args: readonly string[],
  raw = process.env.DATABASE_URL,
) {
  const dryRun =
    args.length === 0 || (args.length === 1 && args[0] === "--dry-run");
  const apply = args.length === 2 && args[0] === "--apply";
  if (!dryRun && !apply)
    throw new Error(
      "Usage: reconcile-cms-delivery [--dry-run | --apply <reviewed-plan-sha256>]",
    );
  if (!raw) throw new Error("DATABASE_URL is required");
  const url = new URL(raw);
  const target = {
    host: url.hostname,
    port: url.port || "5432",
    database: decodeURIComponent(url.pathname.slice(1)),
  };
  const db = postgres(raw, { max: 1, prepare: false, onnotice: () => {} });
  try {
    if (dryRun) {
      const plan = await db.begin("read only", async (tx) =>
        planCmsDeliveryGrants(await readCmsDeliveryCatalog(tx), target),
      );
      return { mode: "dry-run", sha256: cmsDeliveryPlanDigest(plan), plan };
    } else {
      return {
        mode: "applied",
        audit: await reconcileCmsDeliveryGrants(db, target, args[1]),
      };
    }
  } finally {
    await db.end();
  }
}
export async function runCmsDeliveryCli(
  args: readonly string[],
  raw: string | undefined,
  output: Pick<typeof console, "log" | "error"> = console,
): Promise<number> {
  try {
    output.log(
      JSON.stringify(await runCmsDeliveryReconciliation(args, raw), null, 2),
    );
    return 0;
  } catch {
    output.error(
      "CMS delivery reconciliation failed; verify arguments, target, reviewed digest and catalog prerequisites. No partial grant changes are retained.",
    );
    return 1;
  }
}

if (import.meta.path === process.argv[1]) {
  process.exitCode = await runCmsDeliveryCli(
    process.argv.slice(2),
    process.env.DATABASE_URL,
  );
}
