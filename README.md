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
    - **Coverage**: Minimum **80%** via `bun test --coverage` (see `bun run test:coverage`).
    - **Segregation**: `test/unit/**`, `test/integration/**`, `test/feature/**`.
- **Linting**: Standard Bun/TS configuration.

Testing ADR reference: `xynes-cms-core/docs/adr/001-testing-strategy.md`.

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
Liveness check implementing the binding **HEALTHCHECK-CONTRACT.md §2** shape (see `xynes-infra/infra/release/HEALTHCHECK-CONTRACT.md`). Returns:
```json
{
  "ok": true,
  "service": "xynes-authz-service",
  "version": "v0.1.0",
  "uptime_seconds": 1234,
  "checks": { "db": "ok" }
}
```
- **Status**: `200 OK` on happy path; `503 Service Unavailable` when `checks.db === "fail"`.
- **Auth**: NONE required (Docker `HEALTHCHECK` + Caddy probes both run unauthenticated).
- **Latency**: ≤ 50 ms p95 / ≤ 300 ms p99. DB probe has a 1-second timeout.
- **Cascade avoidance** (§4): failed DB probes are cached as `"fail"` for 30 seconds to prevent retry storms from healthcheck-driven traffic.
- **Per-service `checks` keys** (§3): only `db` (authz has no downstream; no `authz` or `gateway` probe).
- **Logging** (§2.6): `/health` and `/ready` are EXCLUDED from the hono access-log middleware to prevent flooding log retention with probe traffic.
- **Body never contains**: `DATABASE_URL`, `JWT_SECRET`, raw API key markers (`xynes_live_*`), stack traces, or any user-identifying value (§2.4 forbidden content; regression-guarded by `test/unit/health.route.unit.test.ts` §7.8).
- **`version` field**: read from `XYNES_BUILD_VERSION` env at process start; falls back to `"dev"` when unset or whitespace-only.

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
Notes:
- Request body is strictly validated (rejects missing/extra fields).
- Oversized bodies are rejected (service-level max body size).

### Response Success (200)
```json
{
  "ok": true,
  "data": { "allowed": true },
  "meta": { "requestId": "req-..." }
}
```

### Response Error (400)
Malformed/missing/invalid fields or oversized body:
```json
{
  "ok": false,
  "error": { "code": "VALIDATION_ERROR", "message": "Invalid request body" },
  "meta": { "requestId": "req-..." }
}
```

### Response Error (500)
If the service cannot check permissions (e.g. database down), it returns:
```json
{
  "ok": false,
  "error": { "code": "INTERNAL_ERROR", "message": "An internal error occurred while checking permissions." },
  "meta": { "requestId": "req-..." }
}
```

## Roles & Permissions
The service is seeded with the following roles:
- **workspace_owner**: Full access to all features.
- **content_editor**: Access to create/edit/read Documents and CMS entries (Blog, Comments).
- **read_only**: Read-only access to Documents and CMS entries.
- **super_admin**: System-wide full access.

New permissions added (AUTHZ-COVERAGE-1 + AUTHZ-CONTENT-2):
- `docs.document.update`
- `docs.document.listByWorkspace`
- `cms.blog_entry.listAdmin`
- `cms.blog_entry.updateMeta`
- `cms.templates.listGlobal`
- `cms.content_types.listForWorkspace` (legacy compatibility)
- `cms.content.create`
- `cms.content.listPublished`
- `cms.content.getPublishedBySlug`

Workspace Admin Integrations (2026-04-24, backend-foundation plan Task 2):
- `platform.domains.list`, `platform.domains.create`, `platform.domains.verify`, `platform.domains.delete`
- `platform.domain_bindings.manage`
- `platform.api_keys.list`, `platform.api_keys.create`, `platform.api_keys.revoke`, `platform.api_keys.usage.read`

Role wiring for the new keys:
- `workspace_owner` and `super_admin` are catalog-derived (`AUTHZ_PERMISSIONS.map(...)`) and therefore inherit every new `platform.*` key automatically.
- `workspace_member`, `content_editor`, and `read_only` use explicit allowlists — they do **not** receive any API-key lifecycle write or domain-lifecycle write.

Guard tests (do not remove without updating the cross-repo contract first):
- `test/unit/workspace-admin-integrations-permissions.test.ts` (bun unit test)
- `xynes-infra/scripts/test/workspace-admin-integrations-authz-permissions.test.sh` (infra cross-repo contract smoke)

Universal Object Storage (2026-05-13, STORAGE-3):
- `platform.storage.providers.manage`
- `platform.storage.objects.upload`, `platform.storage.objects.read`, `platform.storage.objects.delete`
- `platform.storage.objects.process.retry`
- `platform.storage.usage.read`

Role wiring for the storage keys:
- `workspace_owner` and `super_admin` are catalog-derived and inherit all 6.
- `content_editor` gets `platform.storage.objects.{upload,read}` only — no delete, no retry, no provider config, no usage read.
- `workspace_member` and `read_only` get `platform.storage.objects.read` only (MVP conservative default; see plan §12 open question on whether members can upload non-CMS files).

Guard test:
- `test/unit/universal-storage-permissions.test.ts` (bun unit test)

Dev docs:
- `docs/DEV.md`

## Production Dockerfile (H-3)

The `Dockerfile` ships three named stages following the canonical group-H recipe (H-1 pioneer → H-2 → H-3):

| Stage  | Purpose | Used by |
|--------|---------|---------|
| `base` | Pinned `oven/bun:1-alpine` by manifest-list digest + workdir setup | Both `dev` and `prod` |
| `dev`  | Bind-mount-friendly target with `bun --watch` for hot reload | `xynes-infra/docker-compose.dev.yml` |
| `prod` | Hardened runtime: non-root user (uid 1001 `xynes`), no devDependencies, no test/docs payload, no `.env*` files, HEALTHCHECK wired against `/health` | VPS compose + K8s manifests |

**Three deviations from the canonical group-H skeleton** (locked by H-1):
1. **Base image is `oven/bun:1-alpine`**, NOT `oven/bun:1` debian-slim. Drops the prod image from ~253 MB → ~140 MB.
2. **No `build` stage**. Bun runs `src/index.ts` directly through its built-in TS support; typecheck enforced in CI (group-M `ci.yml`), not the Dockerfile.
3. **Healthcheck uses `bun -e 'fetch(...)'`**, NOT `curl`. No extra `apk add curl` layer.

### Building locally

```bash
# Build the prod target
docker buildx build --target prod -t xynesplatform/xynes-authz-service:test --load .

# Run with mock env (DB unreachable → 503 + checks.db = "fail")
docker run --rm -p 4300:4300 \
  -e PORT=4300 \
  -e DATABASE_URL='postgresql://nobody@127.0.0.1:5432/nodb' \
  -e XYNES_BUILD_VERSION='test' \
  xynesplatform/xynes-authz-service:test

# Probe /health
curl http://127.0.0.1:4300/health
# → {"ok":false,"service":"xynes-authz-service","version":"test","uptime_seconds":N,"checks":{"db":"fail"}}
```

### CVE waivers

HIGH/CRITICAL Trivy findings against the prod image are documented in [`CVE-WAIVERS.md`](./CVE-WAIVERS.md) with rationale + remediation tracking. H-3 introduces zero new findings vs the develop-branch image. Three cross-service follow-ups are tracked:
- **H-1-FU-2**: alpine base refresh (closes OpenSSL CVE-2026-45447).
- **H-2-FU-1**: drizzle-orm 0.45.2 bump (closes CVE-2026-39356).
- **H-1-FU-3**: hono ^4.12.4 bump (closes CVE-2026-22817 / 22818 / 29045).
