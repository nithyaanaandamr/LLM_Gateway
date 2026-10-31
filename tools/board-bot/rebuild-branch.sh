#!/usr/bin/env bash
# Rebuilds the sync branch from main, replaying one commit per merged PR in order.
# Never merges main in, so board edits on main can't conflict (see PITFALLS.md: Board bot).
# Run from the repo root by board-sync.yml. Needs env: BRANCH, TIMEZONE, PR_NUMBER, GH_TOKEN.
# Sets step output `changed` (true when this PR added a commit).
set -euo pipefail

OUTPUT=${GITHUB_OUTPUT:-/dev/null}

# PR numbers already on the open sync PR, oldest first
synced_prs() {
  local open_pr
  open_pr=$(gh pr list --head "$BRANCH" --state open --json number --jq '.[0].number')
  [ -n "$open_pr" ] || return 0
  git log --reverse --format=%s "origin/main..origin/$BRANCH" |
    sed -n 's/^docs(.*): move to Done after #\([0-9][0-9]*\)$/\1/p'
}

# Moves one merged PR's tasks to Done and commits, if anything changed
sync_pr() {
  local number=$1 title merged_at date outputs ids
  title=$(gh pr view "$number" --json title --jq .title)
  merged_at=$(gh pr view "$number" --json mergedAt --jq .mergedAt)
  date=$(TZ="$TIMEZONE" date -d "$merged_at" +%F)
  # main.ts reports moved IDs as step outputs; collect this PR's apart from the job's
  outputs=$(mktemp)
  GITHUB_OUTPUT=$outputs node tools/board-bot/src/main.ts --title "$title" --date "$date"
  ids=$(sed -n 's/^ids=//p' "$outputs")
  rm "$outputs"
  [ -n "$ids" ] || return 0
  # synced_prs parses this message
  git commit -qam "docs(${ids}): move to Done after #${number}"
}

synced=$(synced_prs)
if grep -qx "$PR_NUMBER" <<<"$synced"; then
  echo "#$PR_NUMBER is already on the sync PR"
  echo "changed=false" >>"$OUTPUT"
  exit 0
fi

git switch -C "$BRANCH" origin/main
for number in $synced; do
  echo "Replaying #$number"
  sync_pr "$number"
done

before=$(git rev-parse HEAD)
sync_pr "$PR_NUMBER"
if [ "$(git rev-parse HEAD)" = "$before" ]; then
  echo "changed=false" >>"$OUTPUT"
else
  echo "changed=true" >>"$OUTPUT"
fi
