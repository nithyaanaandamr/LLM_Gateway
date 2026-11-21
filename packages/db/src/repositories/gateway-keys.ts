import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import { toDrizzle, type Database, type Queryable } from "../client.ts";
import { gatewayKeys } from "../schema/index.ts";
import { lockForLimit } from "./limit-lock.ts";

// Never includes key_hash: it is not a secret by itself, but nothing outside the gateway needs it
const summaryColumns = {
  id: gatewayKeys.id,
  name: gatewayKeys.name,
  keyPrefix: gatewayKeys.keyPrefix,
  createdAt: gatewayKeys.createdAt,
  revokedAt: gatewayKeys.revokedAt,
};

export type GatewayKeySummary = {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: Date;
  revokedAt: Date | null;
};

export type NewGatewayKey = {
  projectId: string;
  name: string;
  keyHash: Buffer; // SHA-256 of the key; the key itself never reaches this package
  keyPrefix: string;
};

export async function insertGatewayKey(
  db: Queryable,
  input: NewGatewayKey,
): Promise<GatewayKeySummary> {
  const [row] = await toDrizzle(db).insert(gatewayKeys).values(input).returning(summaryColumns);
  if (!row) throw new Error("insert into gateway_keys returned no row");
  return row;
}

// Newest first; revoked keys are included. id breaks ties between equal timestamps.
export function listGatewayKeys(db: Database, projectId: string): Promise<GatewayKeySummary[]> {
  return toDrizzle(db)
    .select(summaryColumns)
    .from(gatewayKeys)
    .where(eq(gatewayKeys.projectId, projectId))
    .orderBy(desc(gatewayKeys.createdAt), desc(gatewayKeys.id));
}

export async function countActiveGatewayKeys(db: Queryable, projectId: string): Promise<number> {
  const [row] = await toDrizzle(db)
    .select({ total: count() })
    .from(gatewayKeys)
    .where(and(eq(gatewayKeys.projectId, projectId), isNull(gatewayKeys.revokedAt)));
  return row?.total ?? 0;
}

// Matches the project too: with the key ID alone, a user could revoke another project's key.
// Keeps the first revoked_at, so repeating it is harmless. False if no such key in this project.
// see PITFALLS.md: Find child rows through their project
export async function revokeGatewayKey(
  db: Database,
  projectId: string,
  keyId: string,
): Promise<boolean> {
  const revoked = await toDrizzle(db)
    .update(gatewayKeys)
    .set({ revokedAt: sql`coalesce(${gatewayKeys.revokedAt}, now())` })
    .where(and(eq(gatewayKeys.id, keyId), eq(gatewayKeys.projectId, projectId)))
    .returning({ id: gatewayKeys.id });
  return revoked.length > 0;
}

export type InsertGatewayKeyWithinLimitResult =
  { status: "created"; gatewayKey: GatewayKeySummary } | { status: "limit_reached" };

// Exact cap on active keys: the project's lock, the count and the insert run in one
// transaction, so parallel creates for the same project take turns. The caller makes the key
// before calling, so the lock is held only for the count and the insert.
// see PITFALLS.md: Limits are counted under a lock
export function insertGatewayKeyWithinLimit(
  db: Database,
  input: NewGatewayKey,
  limit: number,
): Promise<InsertGatewayKeyWithinLimitResult> {
  return toDrizzle(db).transaction(async (tx) => {
    await lockForLimit(tx, "gateway-keys", input.projectId);
    if ((await countActiveGatewayKeys(tx, input.projectId)) >= limit) {
      return { status: "limit_reached" };
    }
    return { status: "created", gatewayKey: await insertGatewayKey(tx, input) };
  });
}
