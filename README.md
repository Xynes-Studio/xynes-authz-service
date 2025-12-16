# Xynes Authz Service

## Overview
This service handles Authorization (RBAC) and Role assignments for Xynes Platform.
Built with **Bun**, **Hono**, **Drizzle ORM**, and **PostgreSQL** (Supabase).

## Global Standards Adherence
- **Segregation**:
    - `src/controllers`: Request/Response handling.
    - `src/services`: Business logic and Database interactions.
    - `src/routes`: Route definitions.
    - `src/db`: Database schema and connection.
    - `src/db/seed`: Idempotent seed logic (upsert by key).
- **Testing**:
    - **TDD**: Tests written before/concurrently with code.
    - **Coverage**: Minimum **75%** via `bun test --coverage` (see `bun run test:coverage`).
    - **Segregation**: `test/unit/**`, `test/integration/**`, `test/feature/**`.
- **Linting**: Standard Bun/TS configuration.

## Setup
1. `bun install`
2. `cp .env.example .env` (Populate `DATABASE_URL`)
3. `bun run migrate`
4. `bun run seed`

## Running
- Dev: `bun run dev` (defaults to `.env.dev`; override with `XYNES_ENV_FILE=.env.localhost`)
- Test: `bun run test`
- Coverage: `bun run test:coverage`
- Lint: `bun run lint`

## API
### GET /health
Liveness check. Returns:
```json
{ "status": "ok", "service": "xynes-authz-service" }
```

### GET /ready
Readiness check. Runs a fast Postgres check and returns:
```json
{ "status": "ready" }
```

### POST /authz/check
Checks if a user has permission to perform an action in a workspace.
**Body**:
```json
{
  "userId": "uuid",
  "workspaceId": "uuid",
  "actionKey": "docs.document.create"
}
```
### Response Success (200)
```json
{ "allowed": true }
```

### Response Error (500)
If the service cannot check permissions (e.g. database down), it returns 500 with a structured error:
```json
{
  "allowed": false,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "An internal error occurred while checking permissions."
  }
}
```

## Roles & Permissions
The service is seeded with the following roles:
- **workspace_owner**: Full access to all features.
- **content_editor**: Access to create/edit/read Documents and CMS entries (Blog, Comments).
- **read_only**: Read-only access to Documents and CMS entries.
- **super_admin**: System-wide full access.

New permissions added (AUTHZ-COVERAGE-1):
- `docs.document.update`
- `docs.document.listByWorkspace`
- `cms.blog_entry.listAdmin`
- `cms.blog_entry.updateMeta`
- `cms.templates.listGlobal`
- `cms.content_types.listForWorkspace`

Dev docs:
- `docs/DEV.md`
