// Moves a merged PR's tasks to Done on the board and in sprint files.
// Usage: node tools/board-bot/src/main.ts --title "<PR title>" --date YYYY-MM-DD
// Run from the repo root. Only edits files; the workflow does git and PRs.

import { appendFile, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { moveToDone } from "./board.ts";
import { markDone } from "./sprint.ts";
import { taskIds } from "./task-ids.ts";

const BOARD = "docs/planning/board.md";
const SPRINTS = "docs/planning/sprints";
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const { values } = parseArgs({
  options: { title: { type: "string" }, date: { type: "string" } },
});
const { title = "", date = "" } = values;
if (!DATE.test(date)) throw new Error(`--date must be YYYY-MM-DD, got "${date}"`);

const ids = taskIds(title);
const board = moveToDone(await readFile(BOARD, "utf8"), ids, date);
if (board.moved.length > 0) await writeFile(BOARD, board.text);

const marked = await markSprints(ids);

console.log(`Tasks in title: ${ids.join(", ") || "none"}`);
console.log(`Moved to Done: ${board.moved.join(", ") || "none"}`);
console.log(`Already Done: ${board.alreadyDone.join(", ") || "none"}`);
console.log(`Sprint rows marked Done: ${marked.join(", ") || "none"}`);
for (const id of board.missing) console.log(`::warning::${id} is not on the board`);

const changedIds = [...new Set([...board.moved, ...marked])];
await writeOutputs({ changed: String(changedIds.length > 0), ids: changedIds.join(",") });

async function markSprints(taskIds: string[]): Promise<string[]> {
  const marked: string[] = [];
  for (const file of await readdir(SPRINTS)) {
    if (!file.endsWith(".md")) continue;
    const path = join(SPRINTS, file);
    const sprint = markDone(await readFile(path, "utf8"), taskIds);
    if (sprint.marked.length === 0) continue;
    await writeFile(path, sprint.text);
    marked.push(...sprint.marked);
  }
  return marked;
}

/** Step outputs for GitHub Actions; no-op when run locally. */
async function writeOutputs(outputs: Record<string, string>): Promise<void> {
  const file = process.env["GITHUB_OUTPUT"];
  if (file === undefined) return;
  const lines = Object.entries(outputs).map(([key, value]) => `${key}=${value}\n`);
  await appendFile(file, lines.join(""));
}
