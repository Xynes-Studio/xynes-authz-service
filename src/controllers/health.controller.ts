// =============================================================================
// /health controller — H-3 (HEALTHCHECK-CONTRACT.md §2 + §3 + §4 + §7).
//
// Implements the binding contract from
// `xynes-infra/infra/release/HEALTHCHECK-CONTRACT.md` for
// xynes-authz-service:
//
//   - GET /health
//   - No auth, no rate-limit, no access-log (see hono/logger skip in
//     src/index.ts).
//   - 200 OK on the happy path; 503 when the critical DB check fails.
//   - Latency budget: ≤ 300 ms p99 per §2.5. Implementation runs a
//     1-second-timeout DB probe.
//   - Failed probes are cached as `"fail"` for 30 s to avoid retry
//     storms per §4 cascade-avoidance rules.
//   - Response body NEVER contains DATABASE_URL, JWT_SECRET, raw API
//     keys, stack traces, or any value that could identify a user or
//     workspace (§2.4 forbidden content / §7.8 defense-in-depth sweep).
//   - Per §3 the declared `checks` keys for authz-service are `db`
//     only (no downstream — authz has no critical dependency beyond
//     Postgres). `db` flips the top-level `ok`.
//
// The handler accepts injected dependencies so tests can stub the DB
// probe, the clock, and the version reader without touching the live
// Postgres pool.
// =============================================================================

import type { Context } from "hono";
import { checkPostgresReadiness } from "../infra/readiness";

const SERVICE_NAME = "xynes-authz-service";
const DEFAULT_VERSION = "dev";
const DB_PROBE_TIMEOUT_MS = 1000;
const PROBE_FAILURE_CACHE_TTL_MS = 30_000;

export type CheckStatus = "ok" | "fail" | "skipped";

export interface HealthResponseBody {
    ok: boolean;
    service: string;
    version: string;
    uptime_seconds: number;
    checks: {
        db: CheckStatus;
    };
}

export interface HealthControllerDeps {
    /** Database liveness probe. Must reject on failure. */
    pingDb?: () => Promise<void>;
    /** Process uptime in seconds (defaults to `process.uptime()`). */
    getUptimeSeconds?: () => number;
    /** Service version string (defaults to `XYNES_BUILD_VERSION` env). */
    getVersion?: () => string;
    /** Monotonic clock for failure-cache TTLs (defaults to `Date.now`). */
    now?: () => number;
}

/**
 * Module-scoped probe failure cache. Cleared when a probe succeeds or
 * the TTL elapses. Survives across handler invocations so a transient
 * downstream outage can't melt the service with retry storms.
 */
let dbProbeFailureAt: number | null = null;

/**
 * Reset the probe failure cache. ONLY for tests; production callers
 * must never reach for this. Exported so test files can isolate cases.
 */
export function resetHealthControllerCacheForTests(): void {
    dbProbeFailureAt = null;
}

function readDefaultVersion(): string {
    const raw = process.env.XYNES_BUILD_VERSION;
    if (!raw) return DEFAULT_VERSION;
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : DEFAULT_VERSION;
}

async function runWithTimeout(
    probe: () => Promise<void>,
    timeoutMs: number,
    timeoutMessage: string,
): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    });
    try {
        await Promise.race([probe(), timeout]);
    } finally {
        if (timer) clearTimeout(timer);
    }
}

/**
 * Default DB probe. Wraps the existing `checkPostgresReadiness` helper
 * (already used by `/ready`) — read-only `SELECT 1`. The surrounding
 * `runWithTimeout` caps it at 1 s per §2.5.
 *
 * Reads `DATABASE_URL` lazily on every call rather than at module load
 * so tests can mutate `process.env` between cases without rebuilding
 * the singleton.
 */
async function defaultPingDb(): Promise<void> {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
        // No need to leak the env-var name in the response (§2.4 forbidden
        // content); the handler's catch block reduces this to a closed-set
        // `"fail"` value.
        throw new Error("database url not configured");
    }
    await checkPostgresReadiness({ databaseUrl });
}

async function evaluateDbCheck(
    pingDb: () => Promise<void>,
    now: () => number,
): Promise<CheckStatus> {
    // Short-circuit on cached recent failure (§4 cascade avoidance).
    if (dbProbeFailureAt !== null && now() - dbProbeFailureAt < PROBE_FAILURE_CACHE_TTL_MS) {
        return "fail";
    }

    try {
        await runWithTimeout(pingDb, DB_PROBE_TIMEOUT_MS, "db probe timeout");
        dbProbeFailureAt = null;
        return "ok";
    } catch {
        // Cache the failure. We deliberately do NOT log the probe error
        // here (§2.6 — at most one warn/min via a rate-limited logger).
        // Operators see the failure via the `checks.db = "fail"` body + the
        // 503 status surfaced to Caddy / Uptime Kuma.
        dbProbeFailureAt = now();
        return "fail";
    }
}

/**
 * Compute the top-level `ok` flag from the per-check status.
 *
 * Per §2.2 field-rules table: `ok` is `true` iff every entry in `checks`
 * is `ok` or `skipped`. Per §3 the authz-service only declares `db`,
 * which is the single critical dependency.
 */
function computeOk(dbStatus: CheckStatus): boolean {
    return dbStatus !== "fail";
}

/**
 * Create a `/health` controller with injectable dependencies. Production
 * callers should use the default export `getHealth` which is wired
 * against the live deps; tests construct their own via `createGetHealth`.
 */
export function createGetHealth(deps: HealthControllerDeps = {}) {
    const pingDb = deps.pingDb ?? defaultPingDb;
    const getUptimeSeconds =
        deps.getUptimeSeconds ?? (() => Math.floor(process.uptime()));
    const getVersion = deps.getVersion ?? readDefaultVersion;
    const now = deps.now ?? (() => Date.now());

    return async (c: Context) => {
        const dbStatus = await evaluateDbCheck(pingDb, now);

        const ok = computeOk(dbStatus);
        const body: HealthResponseBody = {
            ok,
            service: SERVICE_NAME,
            version: getVersion(),
            uptime_seconds: getUptimeSeconds(),
            checks: {
                db: dbStatus,
            },
        };

        return c.json(body, ok ? 200 : 503);
    };
}

/** Default singleton wired against live deps. */
export const getHealth = createGetHealth();
