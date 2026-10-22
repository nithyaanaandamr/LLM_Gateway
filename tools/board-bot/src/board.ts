import { cells, rowId, toRow } from "./table.ts";

const DONE_HEADING = "## Done";

export interface BoardResult {
  text: string;
  moved: string[];
  alreadyDone: string[];
  missing: string[];
}

/** Move task rows from any column to Done, stamped with `date`. */
export function moveToDone(board: string, ids: string[], date: string): BoardResult {
  let lines = board.split("\n");
  const result: BoardResult = { text: board, moved: [], alreadyDone: [], missing: [] };
  const doneIds = new Set(sectionLines(lines, DONE_HEADING).map(rowId));
  const newRows: string[] = [];

  for (const id of ids) {
    if (doneIds.has(id)) {
      result.alreadyDone.push(id);
      continue;
    }
    const index = lines.findIndex((line) => rowId(line) === id);
    if (index === -1) {
      result.missing.push(id);
      continue;
    }
    const [, task = "", phase = ""] = cells(lines[index] ?? "");
    newRows.push(toRow([id, task, phase, date]));
    lines = lines.toSpliced(index, 1);
    result.moved.push(id);
  }

  if (newRows.length > 0) {
    lines = lines.toSpliced(doneTableEnd(lines), 0, ...newRows);
    result.text = lines.join("\n");
  }
  return result;
}

/** Lines between a heading and the next `## ` heading. */
function sectionLines(lines: string[], heading: string): string[] {
  const start = lines.indexOf(heading);
  if (start === -1) return [];
  const next = lines.findIndex((line, i) => i > start && line.startsWith("## "));
  return lines.slice(start + 1, next === -1 ? undefined : next);
}

/** Index just after the last row of the Done table. */
function doneTableEnd(lines: string[]): number {
  const start = lines.indexOf(DONE_HEADING);
  if (start === -1) throw new Error(`Board has no "${DONE_HEADING}" section`);
  let end = start + 1;
  for (let i = start + 1; i < lines.length && !lines[i]?.startsWith("## "); i++) {
    if (lines[i]?.startsWith("|")) end = i + 1;
  }
  return end;
}
