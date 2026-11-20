import { sql } from "drizzle-orm";
import type { Transaction } from "../client.ts";

// Takes a lock named by (scope, id) until the transaction ends (commit or rollback).
// Another transaction asking for the same name waits; other names don't. Use it to make
// "count, then insert" exact: lock, count, insert, all in one transaction.
// Examples: ("projects", userId), ("gateway-keys", projectId).
//
// Values are passed as parameters, never built into the SQL text. hashtextextended turns the
// name into the bigint key that advisory locks need; two names with the same hash would only
// wait for each other needlessly.
// see PITFALLS.md: Limits are counted under a lock
export async function lockForLimit(tx: Transaction, scope: string, id: string): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${scope}::text || ':' || ${id}::text, 0))`,
  );
}
