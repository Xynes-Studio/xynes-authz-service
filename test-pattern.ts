import { AUTHZ_PERMISSIONS } from "./src/db/seed/permissions.config";
const pattern = /^[a-z_]+\.[a-z_]+\.[a-zA-Z]+$/;
for (const perm of AUTHZ_PERMISSIONS) {
  const result = pattern.test(perm.key);
  if (!result) {
    console.log("FAILS:", perm.key, "- tested against pattern");
  }
}
console.log("Total:", AUTHZ_PERMISSIONS.length);
