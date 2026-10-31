// Drizzle wraps the real error (wrong password, refused connection) in `cause`.
// Prints cause text only, never the URL (see PITFALLS.md: Database URL holds the password)
export function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause;
  if (cause instanceof Error) {
    const code = "code" in cause ? String(cause.code) : "";
    return cause.message || code || error.message;
  }
  return error.message;
}
