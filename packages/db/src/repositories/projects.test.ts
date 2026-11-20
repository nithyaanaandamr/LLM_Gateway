import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type DbConnection } from "../client.ts";
import { users } from "../schema/index.ts";
import { createTestDatabase } from "../testing/index.ts";
import {
  countAccessibleProjects,
  deleteProject,
  findAccessibleProject,
  insertProject,
  isProjectNameTaken,
  listAccessibleProjects,
  renameProject,
} from "./projects.ts";

let connection: DbConnection;
const db = () => connection.db;

beforeAll(async () => {
  connection = createDb(await createTestDatabase());
});

afterAll(() => connection.close());

async function insertUser(): Promise<string> {
  const [user] = await db()
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
    await db().execute(
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
