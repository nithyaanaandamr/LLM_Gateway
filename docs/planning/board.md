# Board

Source of truth for all work. Workflow: [README.md](README.md).

## In progress

| ID | Task | Phase | Acceptance criteria |
|---|---|---|---|

## In review

| ID | Task | Phase | Acceptance criteria |
|---|---|---|---|
| GW-022 | Close Sprint 01, start Sprint 02 | 0 | Sprint 01 dates and retro filled; Sprint 02 file with scope and open topics; retro actions recorded |

## Ready

| ID | Task | Phase | Acceptance criteria |
|---|---|---|---|
| GW-012 | Data model spec | 1 | Doc lists tables, columns, relations for users, projects, provider keys, gateway keys; one provider key per project; reviewed |

## Backlog

| ID | Task | Phase | Acceptance criteria |
|---|---|---|---|
| GW-013 | DB package: Drizzle + Testcontainers | 1 | `packages/db` connects to Postgres; tests spin up a throwaway Postgres; migrations run in tests |
| GW-014 | App schema and migrations | 1 | Tables from GW-012 exist via migration; log tables in separate `logs` schema (ADR 0007) |
| GW-015 | Crypto and key helpers in `shared` | 1 | Encrypt/decrypt provider keys; generate `gw_live_…` keys; hash for lookup; unit tested |
| GW-016 | Admin API skeleton | 1 | Fastify app starts; health route; error format; config read from environment variables and validated at startup (refuses to start if one is missing); `.env` for local dev only |
| GW-017 | Dashboard auth (Better Auth) | 1 | Sign up, log in, log out via API; session cookie; note on how sessions work (ADR 0005) |
| GW-018 | Projects API | 1 | Logged-in user can create, list, update, delete own projects; others' projects return 404 |
| GW-019 | Provider key API | 1 | Set/replace/remove one provider key per project; stored encrypted; never returned in full |
| GW-020 | Gateway key API | 1 | Issue (shown once), list (prefix only), revoke; only hash stored |
| GW-021 | Phase 1 E2E test | 1 | Test: sign up → create project → add provider key → get gateway key |
| GW-007 | Fake provider server | 2 | Streaming + non-streaming; configurable delay, error, disconnect |
| GW-009 | Research Redis failure handling | 2 | Findings recorded in a new ADR superseding 0008 |

## Done

| ID | Task | Phase | Completed |
|---|---|---|---|
| GW-001 | Repo skeleton and docs | 0 | 2026-10-22 |
| GW-002 | Decide ADRs 0002–0009 | 0 | 2026-10-22 |
| GW-008 | Protect `main`: repo made public, branch protection applied | 0 | 2026-10-21 |
| GW-003 | Install toolchain (Node 24, pnpm 12, OrbStack) | 0 | 2026-10-22 |
| GW-004 | Root tooling: TypeScript, ESLint, Prettier, Vitest | 0 | 2026-10-22 |
| GW-005 | Local infra running | 0 | 2026-10-22 |
| GW-011 | Board sync bot and review label gate | 0 | 2026-10-22 |
| GW-006 | CI workflow | 0 | 2026-10-22 |
| GW-010 | Finalise roadmap and Phase 1 tasks | 0 | 2026-10-22 |
