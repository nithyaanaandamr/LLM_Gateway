# @gw/board-bot

Moves a merged PR's tasks to Done on [the board](../../docs/planning/board.md) and in sprint files. Run by `.github/workflows/board-sync.yml`; see [ADR 0010](../../docs/decisions/0010-board-sync-bot.md).

The script only edits files. The workflow handles git and the PR.

**Run locally** (from the repo root; edits files in place):

```sh
node tools/board-bot/src/main.ts --title "GW-010: Roadmap" --date 2026-10-22
```

**Expects:**
- Task IDs (`GW-###`) in the PR title
- Board: a `## Done` section; one task per table row
- Sprint files: scope table `| ID | Task | Status |`
- No `|` inside table cells
