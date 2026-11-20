import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index.ts";

export type Database = NodePgDatabase<typeof schema>;

// What a transaction callback receives: same query methods as Database
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

// Repository functions that work both on their own and inside a transaction
export type Queryable = Database | Transaction;

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
