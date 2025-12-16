import postgres from "postgres";

export interface PostgresReadinessCheckOptions {
    databaseUrl: string;
    schemaName?: string;
    createClient?: typeof postgres;
}

export async function checkPostgresReadiness({
    databaseUrl,
    schemaName,
    createClient = postgres,
}: PostgresReadinessCheckOptions): Promise<void> {
    const sql = createClient(databaseUrl, {
        max: 1,
        prepare: false,
        connect_timeout: 2,
        idle_timeout: 2,
    });

    try {
        if (schemaName) {
            await sql`SELECT 1 FROM pg_namespace WHERE nspname = ${schemaName}`;
        } else {
            await sql`SELECT 1`;
        }
    } finally {
        try {
            await sql.end({ timeout: 2 });
        } catch {
            // ignore shutdown errors
        }
    }
}
