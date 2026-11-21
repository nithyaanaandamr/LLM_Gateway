import type { DrizzleDatabase } from "@gw/db/drizzle";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

// Only options that shape the tables. The CLI reads just these, so it needs no secret.
// Takes the real Drizzle client: Better Auth runs its own queries.
export function tableOptions(db: DrizzleDatabase) {
  return {
    database: drizzleAdapter(db, { provider: "pg", usePlural: true, schemaName: "auth" }),
    advanced: { database: { generateId: "uuid" } },
  } as const;
}
