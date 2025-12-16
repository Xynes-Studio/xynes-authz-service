import { describe, test, expect } from "bun:test";
import { checkPostgresReadiness } from "../../src/infra/readiness";

describe.skipIf(process.env.RUN_INTEGRATION_TESTS !== "true")(
    "checkPostgresReadiness (integration)",
    () => {
        test("should succeed when schemaName is provided", async () => {
            const databaseUrl = process.env.DATABASE_URL;
            if (!databaseUrl) {
                throw new Error("DATABASE_URL is required for this test");
            }

            await checkPostgresReadiness({ databaseUrl, schemaName: "public" });
            expect(true).toBe(true);
        });
    },
);
