import { inArray } from "drizzle-orm";
import { roles } from "../db/schema";
import { seedAuthz } from "../db/seed/authz.seed";

const REQUIRED_ROLE_KEYS = ["workspace_owner", "workspace_member"] as const;

let seedOnce: Promise<void> | undefined;

function isAutoSeedEnabled() {
  const raw = process.env.AUTHZ_AUTO_SEED ?? "1";
  const normalized = raw.trim().toLowerCase();
  return !["0", "false", "no", "off"].includes(normalized);
}

export async function ensureAuthzSeeded(): Promise<void> {
  if (!isAutoSeedEnabled()) return;
  if (seedOnce) return seedOnce;

  seedOnce = (async () => {
    const { db } = await import("../db");

    const existing = await db
      .select({ key: roles.key })
      .from(roles)
      .where(inArray(roles.key, [...REQUIRED_ROLE_KEYS]));

    if (existing.length === REQUIRED_ROLE_KEYS.length) return;

    await seedAuthz({ db });
  })().catch((err) => {
    seedOnce = undefined;
    throw err;
  });

  return seedOnce;
}

