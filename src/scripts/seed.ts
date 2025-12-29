/**
 * AUTHZ Database Seed Script
 *
 * Seeds the database with RBAC permissions and role mappings.
 * This script is idempotent - safe to run multiple times.
 *
 * Usage: bun run seed
 */

import { db } from "../db";
import { seedAuthz } from "../db/seed/authz.seed";

async function main() {
  console.log("🌱 Seeding AUTHZ database...");

  try {
    await seedAuthz({ db });
    console.log("✅ Seeding complete!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Seeding failed:", error);
    process.exit(1);
  }
}

main();
