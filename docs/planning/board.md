# Board

Source of truth for all work. Workflow: [README.md](README.md).

## In progress

| ID | Task | Phase | Acceptance criteria |
|---|---|---|---|

## In review

| ID | Task | Phase | Acceptance criteria |
|---|---|---|---|
| GW-011 | Board sync bot and review label gate | 0 | On merge, bot moves the PR's tasks to Done (board + sprint) in a rolling PR; PRs need the `reviewed by nrk` label to merge; ADR recorded |

## Ready

| ID | Task | Phase | Acceptance criteria |
|---|---|---|---|
| GW-010 | Finalise roadmap and Phase 1 tasks | 0 | Roadmap no longer draft; Phase 1 tasks on board |

## Backlog

| ID | Task | Phase | Acceptance criteria |
|---|---|---|---|
| GW-006 | CI workflow | 0 | Lint, typecheck and test run on every PR, only for affected apps |
| GW-007 | Fake provider server | 0 | Streaming + non-streaming; configurable delay, error, disconnect |
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
