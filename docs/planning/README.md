# How work is tracked *(draft)*

The repo is the single source of truth. No external board.

## Files

| File | Holds |
|---|---|
| [roadmap.md](roadmap.md) | Phases and their goals |
| [board.md](board.md) | Every task and its status |
| [sprints/](sprints/) | Sprint goal, scope and retro, one file per sprint |

## Open topics

Each sprint file has an **Open topics** table: every question, idea or draft raised in the sprint, and how far it has got with the owner.

| State | Means |
|---|---|
| Drafted | Written by an agent; the owner hasn't seen it yet |
| Discussed | Talked through with the owner; not settled |
| Decided | Settled; the Link points to where it is recorded |

- Add a row when a topic comes up. Update its state as it moves.
- When resuming work, brief the owner on every `Drafted` topic before asking for decisions on it.
- Start each row with the topic name, never a task ID (see PITFALLS.md: Sprint file tables).

## Sprint scope

Fix the scope at the start of a sprint. New work goes to the board's Backlog unless the sprint goal needs it.

## Task IDs

`GW-###`, numbered in order, never reused.

## Status flow

```
Backlog → Ready → In progress → In review → Done
```

- **Ready** = has acceptance criteria and no open questions.
- **Done** = merged to `main`, tests pass, docs and board updated.

## Linking work to tasks

| Thing | Format | Example |
|---|---|---|
| Branch | `<type>/GW-###-short-name` | `feat/GW-014-rate-limit` |
| Commit | `<type>(GW-###): summary` | `feat(GW-014): add per-key rate limit` |
| PR title | `GW-###: summary` | `GW-014: Per-key rate limit` |

Types: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`.

## Rules

- The PR that changes code also moves its task on the board.
- **Moving to Done is automatic** ([ADR 0010](../decisions/0010-board-sync-bot.md)). After a PR merges, the board bot moves every `GW-###` in its title to Done and marks it Done in the sprint file. It collects these in one rolling PR (`bot/board-sync`) that you review and merge. Merge it before closing a sprint.
- **PR titles** list every task the PR completes: `GW-003, GW-004: summary`.
- **Review label:** a PR merges only with the `reviewed by nrk` label (required check `review-label`). Add it after reviewing. If commits land after labelling, remove and re-add it.
- **Branch names** are settled at the first push; rename the local branch freely before that.
