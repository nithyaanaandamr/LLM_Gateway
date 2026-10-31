import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index.ts";

export type Database = NodePgDatabase<typeof schema>;

export interface DbConnection {
  db: Database;
  close: () => Promise<void>;
}

export function createDb(databaseUrl: string): DbConnection {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  // see PITFALLS.md: pg pool idle errors
  pool.on("error", (error) => {
    console.error("Postgres pool error:", error.message);
  });
  const db = drizzle({ client: pool, schema });
  return { db, close: () => pool.end() };
}
