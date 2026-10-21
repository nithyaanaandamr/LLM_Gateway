# How work is tracked *(draft)*

The repo is the single source of truth. No external board.

## Files

| File | Holds |
|---|---|
| [roadmap.md](roadmap.md) | Phases and their goals |
| [board.md](board.md) | Every task and its status |
| [sprints/](sprints/) | Sprint goal, scope and retro, one file per sprint |

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

## Rule

The PR that changes code also moves its task on the board.
