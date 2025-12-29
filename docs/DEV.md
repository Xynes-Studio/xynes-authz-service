# Xynes Authz Service – Developer Guide

## TL;DR
- Run unit tests: `bun run test:unit`
- Run full suite + coverage (includes DB): `bun run test:coverage`
- Lint: `bun run lint`
- Seed RBAC (idempotent): `bun run seed`

## Folder Structure (Global Standards)
```text
xynes-authz-service/
├── src/
│   ├── index.ts              # Hono app entry point
│   ├── controllers/          # HTTP controllers (request/response)
│   ├── routes/               # Hono route definitions
│   ├── services/             # Business logic (authorization checks)
│   ├── validators/           # Zod request validators
│   ├── lib/                  # Shared utilities (api-error, etc.)
│   ├── db/
│   │   ├── index.ts          # Drizzle database connection
│   │   ├── schema.ts         # Database schema definitions
│   │   ├── migrations/       # Drizzle SQL migrations
│   │   └── seed/             # RBAC seed configuration
│   │       ├── index.ts      # Seed exports
│   │       ├── permissions.config.ts  # Permission & role definitions (AUTHZ-RBAC-2)
│   │       └── authz.seed.ts          # Idempotent seed logic
│   └── scripts/
│       └── seed.ts           # Seed script entrypoint
├── test/
│   ├── unit/                 # Unit tests (no DB required)
│   │   ├── controllers/      # Controller unit tests
│   │   └── services/         # Service unit tests
│   ├── integration/          # Integration tests (DB required)
│   └── feature/              # HTTP contract tests
├── docs/
│   └── DEV.md               # This file
├── biome.json               # Linter configuration
├── package.json
└── tsconfig.json
```

## Database (Supabase via SSH tunnel)
Integration tests and `bun run test:coverage` require Postgres to be reachable via `DATABASE_URL`.
DB-backed suites are gated behind `RUN_INTEGRATION_TESTS=true`.

If your team uses an SSH tunnel to expose the pooler locally, open it with:
```bash
ssh -N -L 5432:127.0.0.1:5432 xynes@<VPS_IP>
```

For the canonical host/user, see the infra docs in `xynes-infra/infra/SSH_TUNNEL_SUPABASE_DB.md`.

Quick validation:
```bash
bun --env-file=.env.dev test test/integration/readiness.integration.test.ts
```

## Migrations
This service uses Drizzle SQL migrations stored in `src/db/migrations`.

Apply migrations:
```bash
bun run migrate
```

## Seeding (Idempotent)
RBAC permissions and role mappings are defined in:
- `src/db/seed/permissions.config.ts` – Permission & role definitions
- `src/db/seed/authz.seed.ts` – Idempotent seed logic

Seed the database (safe to run multiple times):
```bash
bun run seed
```

## Testing Strategy (TDD + Coverage)

We follow **Test-Driven Development** with a test pyramid:

| Layer | Location | DB Required | Purpose |
|-------|----------|-------------|---------|
| **Unit** | `test/unit/` | ❌ | Pure logic, config validation |
| **Integration** | `test/integration/` | ✅ | DB-backed flows, `/authz/check` |
| **Feature** | `test/feature/` | ❌ | HTTP contract tests |

### Running Tests

```bash
# Unit tests only (fast, no DB)
bun run test:unit

# Integration tests (requires SSH tunnel or DB)
bun run test:integration

# All tests with coverage report
bun run test:coverage
```

### Coverage Target

- **Minimum 80%** line coverage on unit-testable code

Reference ADR: `xynes-cms-core/docs/adr/001-testing-strategy.md` (baseline 75% line/branch; this service targets 80%+).

## Environment Files
This service defaults to `.env.dev` (used in Docker/dev workflows). For local development against the SSH tunnel, use `.env.localhost`.

Docker standard:
- `.env.dev` should use `db.local:5432` (works inside `docker-compose.dev.yml` via `extra_hosts`).
- For one-off containers (e.g. `docker run ... psql ...`) prefer `host.docker.internal:5432` on Docker Desktop, or pass `--add-host db.local:host-gateway`.

Examples:
- Dev (default): `bun run dev`
- Dev (localhost env): `XYNES_ENV_FILE=.env.localhost bun run dev`
- Unit tests: `bun run test:unit`
- Integration tests: `bun run test:integration`

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

## RBAC Model (AUTHZ-RBAC-2)

### Permission Format

```text
{service}.{resource}.{action}
```

Examples:
- `docs.document.create`
- `cms.content_entry.publish`
- `accounts.workspaces.listForUser`

### Roles

| Role | Description | Permissions |
|------|-------------|-------------|
| `super_admin` | System administrator | All permissions |
| `workspace_owner` | Workspace owner | All permissions |
| `content_editor` | Content creator/editor | All CMS/Docs + moderate |
| `read_only` | Read-only user | Read/list published only |
| `workspace_member` | Basic member | Minimal permissions |

### Permission Categories

**Accounts Service:**
- `accounts.workspaces.create` – Create workspaces
- `accounts.workspaces.listForUser` – List workspaces for user
- `accounts.invites.create` – Create workspace invites

**Docs Service:**
- `docs.document.create` – Create documents
- `docs.document.read` – Read documents
- `docs.document.update` – Update documents
- `docs.document.listByWorkspace` – List workspace documents

**CMS Content Types:**
- `cms.content_type.manage` – Manage content types (CRUD)

**CMS Content Entries:**
- `cms.content_entry.create` – Create entries
- `cms.content_entry.update` – Update entries
- `cms.content_entry.publish` – Publish entries
- `cms.content_entry.listPublished` – List published entries
- `cms.content_entry.getPublishedBySlug` – Get entry by slug

**CMS Comments:**
- `cms.comments.create` – Create comments
- `cms.comments.listForEntry` – List comments
- `cms.comments.moderate` – Moderate comments (admin)

## Adding New Permissions

Suggested workflow for new RBAC actions:
1. Add/adjust unit tests for seed config and permission checks (`test/unit/**`)
2. Add DB-backed integration tests validating seed + `/authz/check` (`test/integration/**`)
3. Only then update seed/mapping code (`src/db/seed/**`)

Steps:
1. **Add to config** (`src/db/seed/permissions.config.ts`):
   ```typescript
   { key: "service.resource.action", description: "..." }
   ```
2. **Assign to roles** in the same file
3. **Write unit tests** (`test/unit/`)
4. **Run seed** to update database
5. **Write integration tests** if needed

## API Endpoints

### `POST /authz/check`

Check if a user has permission for an action in a workspace.

**Request:**
```json
{
  "userId": "uuid",
  "workspaceId": "uuid",
  "actionKey": "cms.content_entry.publish"
}
```

**Response:**
```json
{
  "ok": true,
  "data": { "allowed": true },
  "meta": { "requestId": "uuid" }
}
```

### `GET /health`

Health check endpoint.

## Code Style

- **Linter:** Biome
- **Format:** 2-space indent, double quotes, semicolons

```bash
# Lint
bun run lint

# Auto-fix
bun run lint:fix

# Format
bun run format
```
