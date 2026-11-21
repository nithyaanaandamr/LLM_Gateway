import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index.ts";

// The real Drizzle client. Only @gw/db, @gw/auth (via @gw/db/drizzle) and tests see it.
export type DrizzleDatabase = NodePgDatabase<typeof schema>;

// What a transaction callback receives: same query methods as DrizzleDatabase
export type Transaction = Parameters<Parameters<DrizzleDatabase["transaction"]>[0]>[0];

declare const databaseBrand: unique symbol;

// What apps get: a handle with no query methods. Pass it to repository functions.
// see PITFALLS.md: Apps get an opaque Database
export type Database = { readonly [databaseBrand]: true };

// Repository functions that work both on their own and inside a transaction
export type Queryable = Database | Transaction;

// Same object at runtime; only the type changes
export function toDrizzle(db: Database): DrizzleDatabase;
export function toDrizzle(db: Queryable): DrizzleDatabase | Transaction;
export function toDrizzle(db: Queryable): DrizzleDatabase | Transaction {
  return db as unknown as DrizzleDatabase | Transaction;
}

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
  const db: DrizzleDatabase = drizzle({ client: pool, schema });
  return { db: db as unknown as Database, close: () => pool.end() };
}
