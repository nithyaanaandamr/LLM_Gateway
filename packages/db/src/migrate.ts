import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

// Found relative to this file; src/ and dist/ are both one level down, so ../migrations works from either
export const MIGRATIONS_FOLDER = fileURLToPath(new URL("../migrations", import.meta.url));

// Always closes its pool: the test template must have no open connections
// (see PITFALLS.md: Test database per file)
export async function runMigrations(databaseUrl: string): Promise<void> {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  try {
    await migrate(drizzle({ client: pool }), { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await pool.end();
  }
}
