// Test-only, not in the main entry. Swaps the database name in a URL.
export function replaceDatabaseName(url: string, database: string): string {
  const next = new URL(url);
  next.pathname = `/${database}`;
  return next.toString();
}
