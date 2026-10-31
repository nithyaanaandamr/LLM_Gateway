import type { Database } from "@gw/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

export interface CreateAuthOptions {
  db: Database;
}

// Only options that shape the tables; GW-017 adds secret, base URL and login methods
export function createAuth({ db }: CreateAuthOptions) {
  return betterAuth({
    database: drizzleAdapter(db, { provider: "pg", usePlural: true, schemaName: "auth" }),
    advanced: { database: { generateId: "uuid" } },
  });
}

export type Auth = ReturnType<typeof createAuth>;
