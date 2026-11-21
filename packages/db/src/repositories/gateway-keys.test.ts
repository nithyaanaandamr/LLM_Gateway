import { randomBytes, randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type DbConnection } from "../client.ts";
import { gatewayKeys, users } from "../schema/index.ts";
import { createTestDatabase } from "../testing/index.ts";
import {
  countActiveGatewayKeys,
  insertGatewayKey,
  insertGatewayKeyWithinLimit,
  listGatewayKeys,
  revokeGatewayKey,
  type NewGatewayKey,
} from "./gateway-keys.ts";
import { insertProject } from "./projects.ts";

let connection: DbConnection;
const db = () => connection.db;

beforeAll(async () => {
  connection = createDb(await createTestDatabase());
});

afterAll(() => connection.close());

async function insertProjectForNewUser(): Promise<string> {
  const [user] = await db()
    .insert(users)
    .values({ name: "Test", email: `${randomUUID()}@example.com` })
    .returning();
  return (await insertProject(db(), user!.id, "project")).id;
}

// Random hash and prefix: these tests never need a real key
function newKey(projectId: string, name = "key"): NewGatewayKey {
  return { projectId, name, keyHash: randomBytes(32), keyPrefix: "gw_live_a1b2" };
}

async function projectWithActiveKeys(count: number): Promise<string> {
  const projectId = await insertProjectForNewUser();
  for (let n = 1; n <= count; n++) await insertGatewayKey(db(), newKey(projectId, `k${n}`));
  return projectId;
}

describe("insertGatewayKey", () => {
  it("returns the summary without the hash", async () => {
    const projectId = await insertProjectForNewUser();

    const row = await insertGatewayKey(db(), newKey(projectId, "ci"));

    expect(Object.keys(row).sort()).toEqual(["createdAt", "id", "keyPrefix", "name", "revokedAt"]);
    expect(row).toMatchObject({ name: "ci", keyPrefix: "gw_live_a1b2", revokedAt: null });
  });

  it("stores the hash it was given", async () => {
    const projectId = await insertProjectForNewUser();
    const input = newKey(projectId);

    const row = await insertGatewayKey(db(), input);

    const [stored] = await db().select().from(gatewayKeys).where(eq(gatewayKeys.id, row.id));
    expect(stored?.keyHash.equals(input.keyHash)).toBe(true);
  });
});

describe("listGatewayKeys", () => {
  it("lists only that project's keys, newest first, revoked included", async () => {
    const [mine, other] = [await insertProjectForNewUser(), await insertProjectForNewUser()];
    const first = await insertGatewayKey(db(), newKey(mine, "first"));
    const second = await insertGatewayKey(db(), newKey(mine, "second"));
    await insertGatewayKey(db(), newKey(other, "other"));
    await revokeGatewayKey(db(), mine, first.id);

    const list = await listGatewayKeys(db(), mine);

    expect(list.map((key) => key.name)).toEqual(["second", "first"]);
    expect(list.map((key) => key.id)).toEqual([second.id, first.id]);
    expect(list[1]?.revokedAt).toBeInstanceOf(Date);
  });

  it("returns an empty list for a project with no keys", async () => {
    expect(await listGatewayKeys(db(), await insertProjectForNewUser())).toEqual([]);
  });

  it("has no hash on its rows", async () => {
    const projectId = await projectWithActiveKeys(1);
    const [row] = await listGatewayKeys(db(), projectId);
    expect(row).not.toHaveProperty("keyHash");
  });
});

describe("countActiveGatewayKeys", () => {
  it("ignores revoked keys and other projects", async () => {
    const [mine, other] = [await projectWithActiveKeys(0), await projectWithActiveKeys(3)];
    const a = await insertGatewayKey(db(), newKey(mine, "a"));
    await insertGatewayKey(db(), newKey(mine, "b"));
    await insertGatewayKey(db(), newKey(mine, "c"));
    await revokeGatewayKey(db(), mine, a.id);

    expect(await countActiveGatewayKeys(db(), mine)).toBe(2);
    expect(await countActiveGatewayKeys(db(), other)).toBe(3);
  });
});

describe("revokeGatewayKey", () => {
  it("sets revokedAt and returns true", async () => {
    const projectId = await insertProjectForNewUser();
    const key = await insertGatewayKey(db(), newKey(projectId));

    expect(await revokeGatewayKey(db(), projectId, key.id)).toBe(true);

    const [row] = await listGatewayKeys(db(), projectId);
    expect(row?.revokedAt).toBeInstanceOf(Date);
  });

  it("keeps the first revokedAt when revoked twice", async () => {
    const projectId = await insertProjectForNewUser();
    const key = await insertGatewayKey(db(), newKey(projectId));
    await revokeGatewayKey(db(), projectId, key.id);
    const [first] = await listGatewayKeys(db(), projectId);
    // now() is the transaction start, so make sure the clock moves between the two calls
    await db().execute(sql`select pg_sleep(0.02)`);

    expect(await revokeGatewayKey(db(), projectId, key.id)).toBe(true);

    const [second] = await listGatewayKeys(db(), projectId);
    expect(second?.revokedAt).toEqual(first?.revokedAt);
  });

  it("returns false for a missing key", async () => {
    const projectId = await insertProjectForNewUser();
    expect(await revokeGatewayKey(db(), projectId, randomUUID())).toBe(false);
  });

  it("returns false for another project's key and leaves it active", async () => {
    const [mine, other] = [await insertProjectForNewUser(), await insertProjectForNewUser()];
    const theirs = await insertGatewayKey(db(), newKey(other));

    expect(await revokeGatewayKey(db(), mine, theirs.id)).toBe(false);

    expect(await listGatewayKeys(db(), other)).toEqual([theirs]);
  });
});

describe("insertGatewayKeyWithinLimit", () => {
  it("creates a key below the limit and refuses at the limit", async () => {
    const projectId = await projectWithActiveKeys(1);

    const first = await insertGatewayKeyWithinLimit(db(), newKey(projectId, "second"), 2);
    const second = await insertGatewayKeyWithinLimit(db(), newKey(projectId, "third"), 2);

    expect(first).toMatchObject({ status: "created", gatewayKey: { name: "second" } });
    expect(second).toEqual({ status: "limit_reached" });
    expect(await countActiveGatewayKeys(db(), projectId)).toBe(2);
  });

  it("does not count revoked keys", async () => {
    const projectId = await insertProjectForNewUser();
    const key = await insertGatewayKey(db(), newKey(projectId));
    await revokeGatewayKey(db(), projectId, key.id);

    const result = await insertGatewayKeyWithinLimit(db(), newKey(projectId), 1);

    expect(result.status).toBe("created");
    expect(await listGatewayKeys(db(), projectId)).toHaveLength(2);
  });

  it("counts only its own project's keys", async () => {
    const [mine, other] = [await projectWithActiveKeys(0), await projectWithActiveKeys(3)];

    expect((await insertGatewayKeyWithinLimit(db(), newKey(mine), 1)).status).toBe("created");
    expect(await countActiveGatewayKeys(db(), other)).toBe(3);
  });

  it("is exact under parallel calls: 20 at 19 of 20 give one created, 19 refused", async () => {
    const projectId = await projectWithActiveKeys(19);
    // Open every pooled connection first, so the calls really overlap
    await Promise.all(Array.from({ length: 10 }, () => db().execute(sql`select pg_sleep(0.05)`)));

    const results = await Promise.all(
      Array.from({ length: 20 }, (_, n) =>
        insertGatewayKeyWithinLimit(db(), newKey(projectId, `race${n}`), 20),
      ),
    );

    expect(results.filter((r) => r.status === "created")).toHaveLength(1);
    expect(results.filter((r) => r.status === "limit_reached")).toHaveLength(19);
    expect(await countActiveGatewayKeys(db(), projectId)).toBe(20);
  });
});
