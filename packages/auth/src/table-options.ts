import type { Database } from "@gw/db";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

// Only options that shape the tables. The CLI reads just these, so it needs no secret.
export function tableOptions(db: Database) {
  return {
    database: drizzleAdapter(db, { provider: "pg", usePlural: true, schemaName: "auth" }),
    advanced: { database: { generateId: "uuid" } },
  } as const;
}
