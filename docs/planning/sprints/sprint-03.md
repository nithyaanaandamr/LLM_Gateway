# Sprint 03

- **Dates:** 2026-11-21 to TBD
- **Goal:** Phase 1.5 structure and guardrails: written rules for how the code is layered, checked by ESLint in CI, plus three small Phase 1 leftovers

## Scope

| ID | Task | Status |
|---|---|---|
| GW-041 | Code structure spec | Open |
| GW-042 | Enforce code boundaries in ESLint | Open |
| GW-045 | Opaque database handle for apps | Open |
| GW-023 | Source maps in `start` and `dev` | Done |
| GW-024 | Move error shape types to `shared` | Open |
| GW-025 | Fix board-bot PITFALLS reference | Done |
| GW-044 | Fix the flaky long-URL error test | Open |

Status is `Open` or `Done`. The board bot sets `Done` after merge.

Order: GW-041 first; GW-042, GW-045 and GW-024 follow its rules. GW-023 and GW-025 can go any time.

## Open topics

| Topic | State | Link |
|---|---|---|
| Phase 1.5 before Phase 2: layer rules and lint guardrails while the code is small, with no behaviour change | Decided | [roadmap.md](../roadmap.md) |
| Sprint scope: structure spec, ESLint boundaries and three small Phase 1 leftovers; readiness route and sign-out failure stay in Backlog | Decided | [board.md](../board.md) |
| Routes call repositories directly; a service file only when the work uses another package or needs 2+ repository calls | Decided | [code-structure.md](../../architecture/code-structure.md#6-route-service-repository) |
| Import rules checked by ESLint (core `no-restricted-imports` plus `eslint-plugin-import-x`): apps never import apps, no Drizzle in app runtime code, test helpers only in tests, browser-safe `shared` entry, no import cycles | Decided | [ADR 0014](../../decisions/0014-code-layers-and-boundary-lint.md) |
| Apps get an opaque database handle, so app code can't run queries | Decided | [ADR 0014](../../decisions/0014-code-layers-and-boundary-lint.md) |

States and rules: [README.md](../README.md#open-topics).

## Retro

- **Went well:**
- **To improve:**
- **Action:**
