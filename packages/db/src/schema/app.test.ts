import { randomBytes, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type DbConnection } from "../client.ts";
import { createTestDatabase } from "../testing/index.ts";
import { gatewayKeys, PROVIDERS, projects, providerKeys } from "./app.ts";
import { users } from "./auth.ts";

let connection: DbConnection;
const db = () => connection.db;

beforeAll(async () => {
  connection = createDb(await createTestDatabase());
});

afterAll(() => connection.close());

async function insertUser(email = `${randomUUID()}@example.com`) {
  const [user] = await db().insert(users).values({ name: "Test", email }).returning();
  return user!;
}

async function insertProject(ownerId: string, name = "p") {
  const [project] = await db().insert(projects).values({ ownerId, name }).returning();
  return project!;
}

const providerKeyValues = (projectId: string) => ({
  projectId,
  provider: "openai" as const,
  ciphertext: Buffer.from("secret"),
  nonce: Buffer.alloc(12),
  authTag: Buffer.alloc(16),
  lastFour: "abcd",
});

const gatewayKeyValues = (projectId: string) => ({
  projectId,
  name: "k",
  keyHash: randomBytes(32),
  keyPrefix: "gw_live_abcd",
});

// Drizzle 0.45 wraps the pg error in `cause`
const violates = (constraint: string) => ({ cause: { constraint } });

describe("app.projects", () => {
  it("rejects a duplicate name for the same owner, allows it for another owner", async () => {
    const owner = await insertUser();
    await insertProject(owner.id, "same");

    await expect(insertProject(owner.id, "same")).rejects.toMatchObject(
      violates("projects_owner_id_name_unique"),
    );
    const other = await insertUser();
    await expect(insertProject(other.id, "same")).resolves.toBeDefined();
  });

  it("limits names to 1-100 characters", async () => {
    const owner = await insertUser();

    await expect(insertProject(owner.id, "")).rejects.toMatchObject(
      violates("projects_name_length_check"),
    );
    await expect(insertProject(owner.id, "x".repeat(101))).rejects.toMatchObject(
      violates("projects_name_length_check"),
    );
    await expect(insertProject(owner.id, "x".repeat(100))).resolves.toBeDefined();
  });

  it("sets updatedAt on update", async () => {
    const owner = await insertUser();
    const [project] = await db()
      .insert(projects)
      .values({ ownerId: owner.id, name: "old", updatedAt: new Date("2020-01-01T00:00:00Z") })
      .returning();

    const [updated] = await db()
      .update(projects)
      .set({ name: "renamed" })
      .where(eq(projects.id, project!.id))
      .returning();

    expect(updated!.updatedAt.getTime()).toBeGreaterThan(
      new Date("2020-01-02T00:00:00Z").getTime(),
    );
  });
});

describe("app.provider_keys", () => {
  it("enforces provider, nonce and tag sizes, one key per project, and round-trips bytea", async () => {
    const project = await insertProject((await insertUser()).id);
    const insert = (values: object) =>
      db()
        .insert(providerKeys)
        .values(values as never);
    const valid = providerKeyValues(project.id);

    await expect(
      // Cast bypasses the TS type to reach the DB rule
      insert({ ...valid, provider: "anthropic" as (typeof PROVIDERS)[number] }),
    ).rejects.toMatchObject(violates("provider_keys_provider_check"));
    await expect(insert({ ...valid, nonce: Buffer.alloc(11) })).rejects.toMatchObject(
      violates("provider_keys_nonce_length_check"),
    );
    await expect(insert({ ...valid, authTag: Buffer.alloc(15) })).rejects.toMatchObject(
      violates("provider_keys_auth_tag_length_check"),
    );

    await insert(valid);
    await expect(insert(valid)).rejects.toMatchObject(violates("provider_keys_project_id_unique"));
    const [row] = await db()
      .select()
      .from(providerKeys)
      .where(eq(providerKeys.projectId, project.id));
    expect(Buffer.isBuffer(row!.ciphertext)).toBe(true);
    expect(row!.ciphertext.equals(valid.ciphertext)).toBe(true);
  });
});

describe("app.gateway_keys", () => {
  it("rejects a key hash that is not 32 bytes", async () => {
    const project = await insertProject((await insertUser()).id);
    const hexAsBytes = Buffer.from(randomBytes(32).toString("hex"));

    await expect(
      db()
        .insert(gatewayKeys)
        .values({ ...gatewayKeyValues(project.id), keyHash: hexAsBytes }),
    ).rejects.toMatchObject(violates("gateway_keys_key_hash_length_check"));
  });

  it("keeps a revoked row, and its hash stays taken", async () => {
    const project = await insertProject((await insertUser()).id);
    const values = gatewayKeyValues(project.id);
    await db().insert(gatewayKeys).values(values);

    await db()
      .update(gatewayKeys)
      .set({ revokedAt: new Date() })
      .where(eq(gatewayKeys.keyHash, values.keyHash));

    const [row] = await db()
      .select()
      .from(gatewayKeys)
      .where(eq(gatewayKeys.keyHash, values.keyHash));
    expect(row?.revokedAt).not.toBeNull();
    await expect(
      db()
        .insert(gatewayKeys)
        .values({ ...gatewayKeyValues(project.id), keyHash: values.keyHash }),
    ).rejects.toMatchObject(violates("gateway_keys_key_hash_unique"));
  });
});

describe("cascades", () => {
  it("deleting a user removes their project and its keys", async () => {
    const owner = await insertUser();
    const project = await insertProject(owner.id);
    await db().insert(providerKeys).values(providerKeyValues(project.id));
    await db().insert(gatewayKeys).values(gatewayKeyValues(project.id));

    await db().delete(users).where(eq(users.id, owner.id));

    expect(await db().select().from(projects).where(eq(projects.id, project.id))).toHaveLength(0);
    expect(
      await db().select().from(providerKeys).where(eq(providerKeys.projectId, project.id)),
    ).toHaveLength(0);
    expect(
      await db().select().from(gatewayKeys).where(eq(gatewayKeys.projectId, project.id)),
    ).toHaveLength(0);
  });
});
