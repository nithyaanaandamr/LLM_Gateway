const UNIQUE_VIOLATION = "23505";
const MAX_DEPTH = 5;

// True if `error` is Postgres unique violation of the named constraint.
// Drizzle wraps the pg error in `cause`, so walk the chain.
// see PITFALLS.md: Unique violations are found by constraint name
export function isUniqueViolation(error: unknown, constraint: string): boolean {
  let current = error;
  for (
    let depth = 0;
    depth < MAX_DEPTH && typeof current === "object" && current !== null;
    depth++
  ) {
    const { code, constraint: name } = current as { code?: unknown; constraint?: unknown };
    if (code === UNIQUE_VIOLATION && name === constraint) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
