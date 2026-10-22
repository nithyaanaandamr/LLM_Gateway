# Board

Source of truth for all work. Workflow: [README.md](README.md).

## In progress

| ID | Task | Phase | Acceptance criteria |
|---|---|---|---|
| GW-003 | Install toolchain | 0 | Node 24, pnpm (via corepack), Docker runtime (OrbStack) installed; versions noted in README |

## In review

| ID | Task | Phase | Acceptance criteria |
|---|---|---|---|

## Ready

| ID | Task | Phase | Acceptance criteria |
|---|---|---|---|

## Backlog

| ID | Task | Phase | Acceptance criteria |
|---|---|---|---|
| GW-004 | Root tooling: TypeScript, ESLint, Prettier, Vitest; per-package deps; lockfile | 0 | `pnpm lint`, `pnpm typecheck`, `pnpm test` pass |
| GW-005 | Local infra running | 0 | `pnpm infra:up` starts Postgres and Redis; health checks pass |
| GW-006 | CI workflow | 0 | Lint, typecheck and test run on every PR, only for affected apps |
| GW-007 | Fake provider server | 0 | Streaming + non-streaming; configurable delay, error, disconnect |
| GW-009 | Research Redis failure handling | 2 | Findings recorded in a new ADR superseding 0008 |
| GW-010 | Finalise roadmap and Phase 1 tasks | 0 | Roadmap no longer draft; Phase 1 tasks on board |
| GW-011 | Evaluate a bot to move tasks to Done on merge | Later | Decision recorded; must work with protected `main` |

## Done

| ID | Task | Phase | Completed |
|---|---|---|---|
| GW-001 | Repo skeleton and docs | 0 | 2026-10-22 |
| GW-002 | Decide ADRs 0002–0009 | 0 | 2026-10-22 |
| GW-008 | Protect `main`: repo made public, branch protection applied | 0 | 2026-10-21 |
