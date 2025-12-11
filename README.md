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
- **Testing**:
    - **TDD**: Tests written before/concurrently with code.
    - **Coverage**: Aiming for >75% coverage.
    - **Tools**: `bun test` for unit/integration.
- **Linting**: Standard Bun/TS configuration.

## Setup
1. `bun install`
2. `cp .env.example .env` (Populate `DATABASE_URL`)
3. `bun run migrate`
4. `bun run seed`

## Running
- Dev: `bun dev`
- Test: `bun test`
- Coverage: `bun test --coverage`
- Lint: `bunx tsc --noEmit`

## API
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
**Response**:
```json
{ "allowed": true }
```
