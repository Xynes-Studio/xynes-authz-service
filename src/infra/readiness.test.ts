import { describe, test, expect } from "bun:test";
import { checkPostgresReadiness } from "./readiness";

describe("checkPostgresReadiness", () => {
    test("should succeed when schemaName is provided", async () => {
        const databaseUrl = process.env.DATABASE_URL;
        if (!databaseUrl) throw new Error("DATABASE_URL is required for this test");

        await checkPostgresReadiness({ databaseUrl, schemaName: "public" });
        expect(true).toBe(true);
    });
});

