# 0010. Board sync bot and review label gate

- **Status:** Accepted
- **Date:** 2026-10-22
- **Task:** GW-011

## Context

Moving a task to Done was a manual "last commit before merge". Easy to forget, and repeated on every PR.
`main` is protected: changes land only through PRs (0 approvals required, admins included). There is one human reviewer, who can't approve their own PRs.

## Options

| Option | Pros | Cons |
|---|---|---|
| A. Manual Done commit (status quo) | No tooling; board on `main` always accurate | Easy to forget; extra step every PR |
| B. Bot opens a PR and merges it itself | Fully automatic; board current within seconds | Bot must bypass the review gate; unreviewed changes reach `main` |
| C. Bot keeps one rolling PR; human merges it | Every change to `main` is reviewed; bot needs only "create PR" rights; no conflicts between bot PRs | Board on `main` lags until the sync PR merges; one extra PR to merge |
| D. Bot opens one PR per merged PR; human merges | Simple | Unmerged bot PRs conflict with each other on the Done table |

## Decision

**C.** On merge, a GitHub Action reads `GW-###` IDs from the PR title, moves those rows to Done (date of merge, India time) and marks them Done in sprint scope tables, then commits to `bot/board-sync` and opens a PR if none is open. The owner reviews, labels and merges it.

Review gate: PRs into `main` need the `reviewed by nrk` label. A required check (`review-label`) fails without it. It applies to bot PRs too.

## Consequences

- No more manual Done commits. Other board moves (Ready → In progress → In review) stay manual, in the task's own PR.
- Board on `main` shows merged tasks as In review until the sync PR merges. Merge it before closing a sprint.
- PR titles must list every task ID they complete.
- Bot PRs don't trigger workflows (GitHub rule for its built-in token). Fine today; becomes a problem once CI is a required check. See PITFALLS.md: board bot.
- Repo settings needed: Actions may create PRs; `review-label` is a required check on `main`.
