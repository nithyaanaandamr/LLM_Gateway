import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type DbConnection } from "../client.ts";
import { users } from "../schema/index.ts";
import { createTestDatabase, toDrizzle } from "../testing/index.ts";
import {
  countAccessibleProjects,
  deleteProject,
  findAccessibleProject,
  insertProject,
  insertProjectWithinLimit,
  isProjectNameTaken,
  listAccessibleProjects,
  renameProject,
} from "./projects.ts";

let connection: DbConnection;
const db = () => connection.db;
const drizzleDb = () => toDrizzle(connection.db);

beforeAll(async () => {
  connection = createDb(await createTestDatabase());
});

afterAll(() => connection.close());

async function insertUser(): Promise<string> {
  const [user] = await drizzleDb()
    .insert(users)
    .values({ name: "Test", email: `${randomUUID()}@example.com` })
    .returning();
  return user!.id;
}

describe("listAccessibleProjects", () => {
  it("returns only the caller's projects, sorted by name", async () => {
    const [me, other] = [await insertUser(), await insertUser()];
    await insertProject(db(), me, "b");
    await insertProject(db(), me, "a");
    await insertProject(db(), other, "c");

    const list = await listAccessibleProjects(db(), me);

    expect(list.map((project) => project.name)).toEqual(["a", "b"]);
  });

  it("sorts by bytes whatever the collation: A, B, a, b", async () => {
    // A linguistic collation would give a, A, b, B. Set it on the column, so the test is
    // sensitive to the ORDER BY even where the database default already sorts by bytes.
    await drizzleDb().execute(
      sql`alter table app.projects alter column name type text collate "und-x-icu"`,
    );
    const me = await insertUser();
    for (const name of ["b", "B", "a", "A", "é"]) await insertProject(db(), me, name);

    const list = await listAccessibleProjects(db(), me);

    expect(list.map((project) => project.name)).toEqual(["A", "B", "a", "b", "é"]);
  });

  it("returns an empty list for a user with no projects", async () => {
    expect(await listAccessibleProjects(db(), await insertUser())).toEqual([]);
  });
});

describe("findAccessibleProject", () => {
  it("returns my project", async () => {
    const me = await insertUser();
    const project = await insertProject(db(), me, "mine");

    expect(await findAccessibleProject(db(), me, project.id)).toEqual(project);
  });

  it("returns undefined for another user's project", async () => {
    const [me, other] = [await insertUser(), await insertUser()];
    const theirs = await insertProject(db(), other, "theirs");

    expect(await findAccessibleProject(db(), me, theirs.id)).toBeUndefined();
  });

  it("returns undefined for a random UUID", async () => {
    expect(await findAccessibleProject(db(), await insertUser(), randomUUID())).toBeUndefined();
  });

  it("matches the uppercase form of the ID and returns the lowercase id", async () => {
    const me = await insertUser();
    const project = await insertProject(db(), me, "mine");

    const found = await findAccessibleProject(db(), me, project.id.toUpperCase());

    expect(found?.id).toBe(project.id);
    expect(found?.id).toBe(found?.id.toLowerCase());
  });
});

describe("countAccessibleProjects", () => {
  it("counts only the caller's projects", async () => {
    const [me, other] = [await insertUser(), await insertUser()];
    await insertProject(db(), me, "a");
    await insertProject(db(), me, "b");
    await insertProject(db(), other, "c");

    expect(await countAccessibleProjects(db(), me)).toBe(2);
    expect(await countAccessibleProjects(db(), await insertUser())).toBe(0);
  });
});

describe("renameProject", () => {
  it("changes the name and bumps updatedAt, keeping createdAt", async () => {
    const me = await insertUser();
    const project = await insertProject(db(), me, "old");

    const renamed = await renameProject(db(), me, project.id, "new");

    expect(renamed?.name).toBe("new");
    expect(renamed?.createdAt).toEqual(project.createdAt);
    expect(renamed!.updatedAt.getTime()).toBeGreaterThan(project.updatedAt.getTime());
  });

  it("returns undefined for a missing project", async () => {
    expect(await renameProject(db(), await insertUser(), randomUUID(), "x")).toBeUndefined();
  });

  it("returns undefined for another user's project and leaves the row unchanged", async () => {
    const [me, other] = [await insertUser(), await insertUser()];
    const theirs = await insertProject(db(), other, "theirs");

    expect(await renameProject(db(), me, theirs.id, "mine-now")).toBeUndefined();

    expect(await findAccessibleProject(db(), other, theirs.id)).toEqual(theirs);
  });
});

describe("deleteProject", () => {
  it("deletes the row and returns true", async () => {
    const me = await insertUser();
    const project = await insertProject(db(), me, "gone");

    expect(await deleteProject(db(), me, project.id)).toBe(true);
    expect(await findAccessibleProject(db(), me, project.id)).toBeUndefined();
  });

  it("returns false for a missing row", async () => {
    expect(await deleteProject(db(), await insertUser(), randomUUID())).toBe(false);
  });

  it("returns false for another user's project and leaves the row in place", async () => {
    const [me, other] = [await insertUser(), await insertUser()];
    const theirs = await insertProject(db(), other, "theirs");

    expect(await deleteProject(db(), me, theirs.id)).toBe(false);

    expect(await findAccessibleProject(db(), other, theirs.id)).toEqual(theirs);
  });
});

describe("isProjectNameTaken", () => {
  async function caught(run: () => Promise<unknown>): Promise<unknown> {
    try {
      await run();
    } catch (error) {
      return error;
    }
    throw new Error("expected the call to fail");
  }

  it("is true for a duplicate name on insert and on rename, false for other errors", async () => {
    const me = await insertUser();
    await insertProject(db(), me, "taken");
    const other = await insertProject(db(), me, "other");

    const onInsert = await caught(() => insertProject(db(), me, "taken"));
    const onRename = await caught(() => renameProject(db(), me, other.id, "taken"));

    expect(isProjectNameTaken(onInsert)).toBe(true);
    expect(isProjectNameTaken(onRename)).toBe(true);
    expect(isProjectNameTaken(new Error("boom"))).toBe(false);
  });
});

describe("insertProjectWithinLimit", () => {
  async function userWith(count: number): Promise<string> {
    const userId = await insertUser();
    for (let n = 1; n <= count; n++) await insertProject(db(), userId, `p${n}`);
    return userId;
  }

  it("creates a project below the limit and refuses at the limit", async () => {
    const me = await userWith(1);

    const first = await insertProjectWithinLimit(db(), me, "second", 2);
    const second = await insertProjectWithinLimit(db(), me, "third", 2);

    expect(first).toMatchObject({ status: "created", project: { name: "second" } });
    expect(second).toEqual({ status: "limit_reached" });
    expect(await countAccessibleProjects(db(), me)).toBe(2);
  });

  it("counts only the caller's projects", async () => {
    const [me, other] = [await userWith(0), await userWith(3)];
    expect(await insertProjectWithinLimit(db(), me, "mine", 1)).toMatchObject({
      status: "created",
    });
    expect(await countAccessibleProjects(db(), other)).toBe(3);
  });

  it("is exact under parallel calls: 20 at 99 of 100 give one created, 19 refused", async () => {
    const me = await userWith(99);
    // Open every pooled connection first, so the calls really overlap
    await Promise.all(
      Array.from({ length: 10 }, () => drizzleDb().execute(sql`select pg_sleep(0.05)`)),
    );

    const results = await Promise.all(
      Array.from({ length: 20 }, (_, n) => insertProjectWithinLimit(db(), me, `race${n}`, 100)),
    );

    expect(results.filter((r) => r.status === "created")).toHaveLength(1);
    expect(results.filter((r) => r.status === "limit_reached")).toHaveLength(19);
    expect(await countAccessibleProjects(db(), me)).toBe(100);
  });

  it("throws a duplicate-name error and stores nothing extra", async () => {
    const me = await userWith(1);

    const error = await insertProjectWithinLimit(db(), me, "p1", 5).catch((e: unknown) => e);

    expect(isProjectNameTaken(error)).toBe(true);
    expect(await countAccessibleProjects(db(), me)).toBe(1);
  });
});
