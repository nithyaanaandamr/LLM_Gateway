// Error messages never include the URL (see PITFALLS.md: Database URL holds the password)
export function readDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const value = env.DATABASE_URL;
  if (value === undefined || value.trim() === "") {
    throw new Error("DATABASE_URL is not set");
  }
  if (!isPostgresUrl(value)) {
    throw new Error("DATABASE_URL must be a postgres:// or postgresql:// URL");
  }
  return value;
}

function isPostgresUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "postgres:" || protocol === "postgresql:";
  } catch {
    return false;
  }
}
