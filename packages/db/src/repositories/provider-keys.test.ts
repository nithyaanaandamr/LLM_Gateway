import { randomBytes, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type DbConnection } from "../client.ts";
import { providerKeys, users } from "../schema/index.ts";
import { createTestDatabase, toDrizzle } from "../testing/index.ts";
import { insertProject } from "./insert-project.ts";
import {
  deleteProviderKey,
  findProviderKeySummary,
  upsertProviderKey,
  type EncryptedKeyColumns,
} from "./provider-keys.ts";

let connection: DbConnection;
const db = () => connection.db;
const drizzleDb = () => toDrizzle(connection.db);

beforeAll(async () => {
  connection = createDb(await createTestDatabase());
});

afterAll(() => connection.close());

async function insertProjectForNewUser(): Promise<string> {
  const [user] = await drizzleDb()
    .insert(users)
    .values({ name: "Test", email: `${randomUUID()}@example.com` })
    .returning();
  return (await insertProject(db(), user!.id, "p")).id;
}

const encrypted = (): EncryptedKeyColumns => ({
  ciphertext: randomBytes(40),
  nonce: randomBytes(12),
  authTag: randomBytes(16),
  masterKeyVersion: 1,
});

const rowOf = async (projectId: string) => {
  const rows = await drizzleDb()
    .select()
    .from(providerKeys)
    .where(eq(providerKeys.projectId, projectId));
  return rows;
};

describe("upsertProviderKey", () => {
  it("inserts on the first call", async () => {
    const projectId = await insertProjectForNewUser();
    const bytes = encrypted();

    const summary = await upsertProviderKey(db(), {
      projectId,
      provider: "openai",
      encrypted: bytes,
      lastFour: "abcd",
    });

    expect(summary).toMatchObject({ provider: "openai", lastFour: "abcd" });
    const [row] = await rowOf(projectId);
    expect(row?.ciphertext.equals(bytes.ciphertext)).toBe(true);
    expect(row?.nonce.equals(bytes.nonce)).toBe(true);
    expect(row?.authTag.equals(bytes.authTag)).toBe(true);
    expect(row?.masterKeyVersion).toBe(1);
  });

  it("replaces in place: keeps id and createdAt, changes the bytes and lastFour", async () => {
    const projectId = await insertProjectForNewUser();
    const first = { projectId, provider: "openai" as const, lastFour: "aaaa" };
    await upsertProviderKey(db(), { ...first, encrypted: encrypted() });
    const [before] = await rowOf(projectId);
    const bytes = encrypted();

    const summary = await upsertProviderKey(db(), {
      ...first,
      encrypted: bytes,
      lastFour: "bbbb",
    });

    const rows = await rowOf(projectId);
    expect(rows).toHaveLength(1);
    const [after] = rows;
    expect(after?.id).toBe(before?.id);
    expect(after?.createdAt).toEqual(before?.createdAt);
    expect(after?.nonce.equals(before!.nonce)).toBe(false);
    expect(after?.ciphertext.equals(before!.ciphertext)).toBe(false);
    expect(after?.ciphertext.equals(bytes.ciphertext)).toBe(true);
    expect(after?.lastFour).toBe("bbbb");
    expect(summary.lastFour).toBe("bbbb");
    expect(after!.updatedAt.getTime()).toBeGreaterThanOrEqual(before!.updatedAt.getTime());
    expect(summary.updatedAt).toEqual(after?.updatedAt);
  });

  it("returns only the summary fields, never the encrypted columns", async () => {
    const projectId = await insertProjectForNewUser();

    const summary = await upsertProviderKey(db(), {
      projectId,
      provider: "openai",
      encrypted: encrypted(),
      lastFour: "abcd",
    });

    expect(Object.keys(summary).sort()).toEqual(["createdAt", "lastFour", "provider", "updatedAt"]);
  });
});

describe("findProviderKeySummary", () => {
  it("returns the summary fields only", async () => {
    const projectId = await insertProjectForNewUser();
    await upsertProviderKey(db(), {
      projectId,
      provider: "openai",
      encrypted: encrypted(),
      lastFour: "wxyz",
    });

    const summary = await findProviderKeySummary(db(), projectId);

    expect(summary).toMatchObject({ provider: "openai", lastFour: "wxyz" });
    expect(Object.keys(summary!).sort()).toEqual([
      "createdAt",
      "lastFour",
      "provider",
      "updatedAt",
    ]);
  });

  it("returns undefined when the project has no key", async () => {
    expect(await findProviderKeySummary(db(), await insertProjectForNewUser())).toBeUndefined();
  });
});

describe("deleteProviderKey", () => {
  it("returns true the first time and false the second", async () => {
    const projectId = await insertProjectForNewUser();
    await upsertProviderKey(db(), {
      projectId,
      provider: "openai",
      encrypted: encrypted(),
      lastFour: "abcd",
    });

    expect(await deleteProviderKey(db(), projectId)).toBe(true);
    expect(await deleteProviderKey(db(), projectId)).toBe(false);
    expect(await rowOf(projectId)).toHaveLength(0);
  });

  it("leaves another project's key alone", async () => {
    const [a, b] = [await insertProjectForNewUser(), await insertProjectForNewUser()];
    for (const projectId of [a, b]) {
      await upsertProviderKey(db(), {
        projectId,
        provider: "openai",
        encrypted: encrypted(),
        lastFour: "abcd",
      });
    }

    await deleteProviderKey(db(), a);

    expect(await rowOf(b)).toHaveLength(1);
  });
});
