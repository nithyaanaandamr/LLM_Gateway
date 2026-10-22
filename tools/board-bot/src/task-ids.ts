const TASK_ID = /\bGW-\d{3,}\b/g;

/** Unique task IDs in a PR title, in order of appearance. */
export function taskIds(title: string): string[] {
  return [...new Set(title.match(TASK_ID) ?? [])];
}
