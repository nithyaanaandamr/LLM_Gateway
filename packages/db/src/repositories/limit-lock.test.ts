import { setTimeout as sleep } from "node:timers/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type DbConnection } from "../client.ts";
import { createTestDatabase } from "../testing/index.ts";
import { lockForLimit } from "./limit-lock.ts";

let connection: DbConnection;
const db = () => connection.db;

beforeAll(async () => {
  connection = createDb(await createTestDatabase());
});

afterAll(() => connection.close());

// Holds the lock for (scope, id) in an open transaction until release() is called
async function holdLock(scope: string, id: string) {
  let release = () => {};
  const released = new Promise<void>((resolve) => (release = resolve));
  let locked = () => {};
  const isLocked = new Promise<void>((resolve) => (locked = resolve));
  const done = db().transaction(async (tx) => {
    await lockForLimit(tx, scope, id);
    locked();
    await released;
  });
  await isLocked;
  return { release, done };
}

// True if the lock was taken within the wait time
async function acquiredWithin(scope: string, id: string, ms: number): Promise<boolean> {
  let acquired = false;
  const attempt = db().transaction(async (tx) => {
    await lockForLimit(tx, scope, id);
    acquired = true;
  });
  await Promise.race([attempt, sleep(ms)]);
  return acquired;
}

describe("lockForLimit", () => {
  it("makes a second transaction with the same scope and id wait until the first ends", async () => {
    const held = await holdLock("projects", "user-1");

    const second = acquiredWithin("projects", "user-1", 300);
    await sleep(350);
    expect(await second).toBe(false);

    held.release();
    await held.done;
    expect(await acquiredWithin("projects", "user-1", 2000)).toBe(true);
  });

  it("does not block another id or another scope", async () => {
    const held = await holdLock("projects", "user-2");

    expect(await acquiredWithin("projects", "user-3", 2000)).toBe(true);
    expect(await acquiredWithin("gateway-keys", "user-2", 2000)).toBe(true);

    held.release();
    await held.done;
  });

  it("is released when the transaction rolls back", async () => {
    await expect(
      db().transaction(async (tx) => {
        await lockForLimit(tx, "projects", "user-4");
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(await acquiredWithin("projects", "user-4", 2000)).toBe(true);
  });
});
