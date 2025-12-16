import { db } from "../db";
import { seedAuthz } from "../db/seed/authz.seed";

async function main() {
  console.log("Seeding database...");
  await seedAuthz({ db });

  console.log("Seeding complete!");
  process.exit(0);
}

main().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
