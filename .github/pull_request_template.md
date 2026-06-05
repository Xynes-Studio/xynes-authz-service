## Summary
<!-- One-paragraph description of what this PR does and why. -->

## Linked work
- Plan / issue: <!-- link -->
- Related repos: <!-- link any PRs that depend on or are depended on by this one -->

## Quality gates
- [ ] `lint` passes locally
- [ ] `test` passes locally
- [ ] Coverage ≥ ADR-001 80% floor (or justified exception below)
- [ ] `typecheck` / `build` passes (where applicable)
- [ ] Docs updated (`README.md`, `DEVELOPER.md`, `AGENTS.md`, repo memory)
- [ ] Migration added (if schema change) — forward-only, expand/contract
- [ ] QA PII scrub updated (if migration adds PII)
- [ ] Release doc set updated (if release contract changed)

## Security
- [ ] No secrets in code, logs, error messages, or test fixtures
- [ ] No raw API keys forwarded to downstream services
- [ ] No PII added to telemetry or access logs

## Deployment notes
<!-- e.g. "Requires migration run before service rollout", "Requires xynes-platform-contracts vX.Y.Z first". -->

## Rollback plan
<!-- For risky changes only. -->

---

## Repo-specific items (xynes-authz-service)

This is a **Bun + Hono + Drizzle** service backed by **Biome** for lint/format. Use `bun`, never `npm`.

- [ ] Lint: `bun run lint` (biome `lint src test`)
- [ ] Format check: `bunx biome format src test` — run `bun run format` to fix
- [ ] Tests: `bun run test` (full suite) OR `bun run test:unit` (unit only) — default env file `.env.dev`
- [ ] Integration tests (when touching DB-bound code): `bun run test:integration` (sets `RUN_INTEGRATION_TESTS=true`)
- [ ] Coverage: `bun run test:coverage` — overall must stay at or above the **ADR-001 80% lines + branches floor**
- [ ] Typecheck: `bun x tsc --noEmit` — zero new errors vs the target branch baseline (verify with `git stash` round-trip if pre-existing errors exist)
- [ ] **Permission catalog (`src/db/seed/permissions.config.ts`).** This is the single source of truth for every `action_key` the gateway can authorise. Adding a new action key requires:
  - [ ] Add the row to `AUTHZ_PERMISSIONS` AND wire it into the correct role allowlists (default: `workspace_owner` + `super_admin` via `AUTHZ_PERMISSIONS.map((p) => p.key)`).
  - [ ] Update the matching role-permission tests under `test/unit/` so role allowlists stay locked.
  - [ ] Run `bun run seed` against a local DB to verify replay-safety (`ON CONFLICT (key) DO NOTHING`).
  - [ ] Open the matching `xynes-infra/supabase/migrations/20251229100001_seed_platform_routes.sql` route seed PR AND the consumer service's handler PR in lockstep. Merge order: this PR + route seed first, then the consumer.
- [ ] If touching `src/db/schema.ts`: add the matching forward-only Drizzle migration under `src/db/migrations/` (per `drizzle.config.ts` `out`). The `authz` schema is owned by this service (per `xynes-infra/docs/DATABASE.md` §3); avoid touching `platform.*` / `identity.*` tables — they are owned by `xynes-infra`.
- [ ] **API-key actors are gateway-enforced (PFU-1 + CMS-API-KEY-ACTOR-1 Story B).** The gateway calls `authz.check` ONLY for user actors. PRs that change `authzService.check` semantics MUST preserve the "no downstream user check when `actor.kind === 'api_key'`" invariant — the gateway has already scope-checked the API key against the route's action key before reaching here.
- [ ] **Closed-set error codes only.** Provider / postgres / Drizzle error text MUST NOT propagate into envelope `error.message` or `error.details`. New error paths land as additions to the existing closed-set unions.
- [ ] No raw credentials in `permissions.config.ts`, role names, or any test fixture. No `AKIA*` / `xynes_live_*` / `re_*` / signed-URL substrings anywhere.
