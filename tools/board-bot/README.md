# @gw/board-bot

Moves a merged PR's tasks to Done on [the board](../../docs/planning/board.md) and in sprint files. Run by `.github/workflows/board-sync.yml`; see [ADR 0010](../../docs/decisions/0010-board-sync-bot.md).

`src/main.ts` only edits files. `rebuild-branch.sh` rebuilds the sync branch from `main` and commits once per merged PR; the workflow pushes and opens the PR. Replays read the commit messages (`docs(GW-###): move to Done after #N`), so keep that format.

**Run locally** (from the repo root; edits files in place):

```sh
node tools/board-bot/src/main.ts --title "GW-010: Roadmap" --date 2026-10-22
```

**Expects:**
- Task IDs (`GW-###`) in the PR title
- Board: a `## Done` section; one task per table row
- Sprint files: scope table `| ID | Task | Status |`
- No `|` inside table cells
