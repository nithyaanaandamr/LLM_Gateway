// Helpers for the one-row-per-line Markdown tables in board and sprint files.

const TASK_ROW = /^\|\s*(GW-\d+)\s*\|/;

/** Task ID of a table row, or undefined if the line is not a task row. */
export function rowId(line: string): string | undefined {
  return TASK_ROW.exec(line)?.[1];
}

/** Cell values of a table row. Cells must not contain `|`. */
export function cells(line: string): string[] {
  return line
    .split("|")
    .slice(1, -1)
    .map((cell) => cell.trim());
}

export function toRow(values: string[]): string {
  return `| ${values.join(" | ")} |`;
}
