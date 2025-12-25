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

### Workspace Invites (INVITES-CORE-1)

- New permission seeded: `accounts.invites.create`
  - Used by the accounts service when creating workspace invites
  - Enforced via `POST /authz/check` from the gateway/accounts-service client

## Testing Strategy (TDD + Coverage)
Follow the testing ADR standard (unit → integration → feature) and keep coverage ≥ 80%.

Reference ADR: `xynes-cms-core/docs/adr/001-testing-strategy.md` (baseline 75% line/branch; this service targets 80%+).

## Environment Files
This service defaults to `.env.dev` (used in Docker/dev workflows). For local development against the SSH tunnel, use `.env.localhost`.

Docker standard:
- `.env.dev` should use `db.local:5432` (works inside `docker-compose.dev.yml` via `extra_hosts`).
- For one-off containers (e.g. `docker run ... psql ...`) prefer `host.docker.internal:5432` on Docker Desktop, or pass `--add-host db.local:host-gateway`.

Examples:
- Dev (default): `bun run dev`
- Dev (localhost env): `XYNES_ENV_FILE=.env.localhost bun run dev`
- Unit tests: `bun --env-file=.env.dev test test/unit`
- Integration tests: `RUN_INTEGRATION_TESTS=true bun --env-file=.env.localhost test test/integration`

## Internal Auth (SEC-INT-1)

`POST /authz/check` is service-to-service and now requires:
- Env: `INTERNAL_SERVICE_TOKEN`
- Header: `X-Internal-Service-Token: <token>`

Internal role assignment is also service-to-service:

- `POST /internal/authz-actions`
  - Requires `X-Internal-Service-Token`
  - Request envelope: `{ actionKey: "authz.assignRole", payload: { userId, workspaceId, roleKey } }`
  - `roleKey` is restricted to: `workspace_owner` | `workspace_member`

## `/authz/check` Validation & Limits (SEC-AUTHZ-1)
- Strict JSON schema validation (rejects missing/extra fields) using `zod`:
  - `userId`: UUID string
  - `workspaceId`: UUID string or `null` (for global/non-workspace-scoped actions)
  - `actionKey`: non-empty string (max 256)
- Max request body size is capped (service-level) to reduce abuse/DoS risk.
- Invalid/malformed/oversized requests return `400` with the standard error envelope:
  - `{ ok: false, error: { code, message }, meta: { requestId } }`

Suggested workflow for new RBAC actions:
1. Add/adjust unit tests for seed config and permission checks (`test/unit/**`)
2. Add DB-backed integration tests validating seed + `/authz/check` (`test/integration/**`)
3. Only then update seed/mapping code (`src/db/seed/**`)

## ACCOUNTS-SCHEMA-1 Verification (DB)
Expected state after infra + authz migrations:
- `identity.users`
- `platform.workspaces` (FK `created_by -> identity.users(id)`)
- `platform.workspace_members` (PK `(workspace_id, user_id)`, FKs to workspaces/users)
- `authz.user_roles` (PK `(user_id, workspace_id, role_key)`, FK `role_key -> authz.roles(key)`)

If you don’t have `psql` installed locally, you can run it via Docker:
`docker run --rm -i postgres:16-alpine psql "$DATABASE_URL" -c "select 1"`
