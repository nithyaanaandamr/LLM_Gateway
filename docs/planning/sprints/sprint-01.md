# Sprint 01

- **Dates:** 2026-10-21 to 2026-10-22
- **Goal:** Phase 0 foundations: decisions made, toolchain installed, repo runnable

## Scope

| ID | Task | Status |
|---|---|---|
| GW-001 | Repo skeleton and docs | Done |
| GW-002 | Decide ADRs 0002–0009 | Done |
| GW-003 | Install toolchain | Done |
| GW-004 | Root tooling | Done |
| GW-005 | Local infra running | Done |
| GW-006 | CI workflow | Done |
| GW-008 | Protect `main` | Done |
| GW-010 | Finalise roadmap and Phase 1 tasks | Done |
| GW-011 | Board sync bot and review label gate | Done |
| GW-022 | Close Sprint 01, start Sprint 02 | Done |

Status is `Open` or `Done`. The board bot sets `Done` after merge.

## Retro

- **Went well:**
  - Discussions and setup were quick and easy.
  - Decisions were written down (ADRs, board) before code, so paused work could be resumed.
  - The CI filter was tested locally; a bug was caught before it reached GitHub.
- **To improve:**
  - On resuming a paused task, the agent assumed the user remembered drafts they had never seen.
  - A GitHub behaviour (bot PRs and workflows) went into the docs unchecked; PR #4's run history proved it wrong.
  - Scope grew mid-sprint (GW-004, GW-005, GW-006, GW-011 added).
- **Action:**
  - Track whether each topic was drafted, discussed or decided: Open topics table in each sprint file.
  - Keep code modular, structured and maintainable: rule in `CLAUDE.md` (Code structure).
  - Fix sprint scope at the start; new work goes to the board backlog unless the sprint goal needs it.
  - Check platform behaviour against real evidence (docs, run history) before writing it down.
