# Xynes Authz Service – Developer Guide

## TL;DR
- Run unit tests: `bun test test/unit`
- Run full suite + coverage (includes DB): `bun run test:coverage`
- Lint: `bun run lint`
- Seed RBAC (idempotent): `bun run seed`

## Folder Structure (Global Standards)
- `src/controllers/`: HTTP controllers (request/response orchestration)
- `src/routes/`: Route registration (Hono)
- `src/services/`: Domain logic (authorization checks)
- `src/db/`: Drizzle schema, migrations, seed helpers
  - `src/db/seed/`: Idempotent seed logic (upsert by key)
- `test/unit/`: No DB, no network (pure logic and injected dependencies)
- `test/integration/`: DB-backed behaviour (seed + `/authz/check`)
- `test/feature/`: HTTP contract tests (controller behaviour)

## Database (Supabase via SSH tunnel)
Integration tests and `bun run test:coverage` require Postgres to be reachable via `DATABASE_URL`.
DB-backed suites are gated behind `RUN_INTEGRATION_TESTS=true`.

If your team uses an SSH tunnel to expose the pooler locally, open it with:
`ssh -N -L 5432:127.0.0.1:5432 xynes@<VPS_IP>`

For the canonical host/user, see the infra docs in `xynes-infra/infra/SSH_TUNNEL_SUPABASE_DB.md`.

Quick validation:
- `bun --env-file=.env.dev test test/integration/readiness.integration.test.ts`

## Migrations
This service uses Drizzle SQL migrations stored in `src/db/migrations`.

Apply migrations:
- `bun run migrate`

## Seeding (Idempotent)
RBAC permissions and role mappings are defined in:
- `src/db/seed/authz.seed.ts`

Seed the database (safe to run multiple times):
- `bun run seed`

## Testing Strategy (TDD + Coverage)
Follow the testing ADR standard (unit → integration → feature) and keep coverage ≥ 75%.

## Internal Auth (SEC-INT-1)

`POST /authz/check` is service-to-service and now requires:
- Env: `INTERNAL_SERVICE_TOKEN`
- Header: `X-Internal-Service-Token: <token>`

Suggested workflow for new RBAC actions:
1. Add/adjust unit tests for seed config and permission checks (`test/unit/**`)
2. Add DB-backed integration tests validating seed + `/authz/check` (`test/integration/**`)
3. Only then update seed/mapping code (`src/db/seed/**`)
