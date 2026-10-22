import { cells, rowId, toRow } from "./table.ts";

const DONE = "Done";

export interface SprintResult {
  text: string;
  marked: string[];
}

/** Set Status to Done for scope rows (`| ID | Task | Status |`) of the given tasks. */
export function markDone(sprint: string, ids: string[]): SprintResult {
  const marked: string[] = [];
  const lines = sprint.split("\n").map((line) => {
    const id = rowId(line);
    if (id === undefined || !ids.includes(id)) return line;
    const [rowTaskId = id, task = "", status = ""] = cells(line);
    if (status === DONE) return line;
    marked.push(id);
    return toRow([rowTaskId, task, DONE]);
  });
  return { text: marked.length > 0 ? lines.join("\n") : sprint, marked };
}
