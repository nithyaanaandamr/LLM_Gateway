import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type DbConnection } from "../client.ts";
import { users } from "../schema/index.ts";
import { createTestDatabase } from "../testing/index.ts";
import {
  countAccessibleProjects,
  deleteProject,
  findAccessibleProject,
  insertProject,
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
    await insertProject(db(), { ownerId: me, name: "b" });
    await insertProject(db(), { ownerId: me, name: "a" });
    await insertProject(db(), { ownerId: other, name: "c" });

    const list = await listAccessibleProjects(db(), me);

    expect(list.map((project) => project.name)).toEqual(["a", "b"]);
  });

  it("returns an empty list for a user with no projects", async () => {
    expect(await listAccessibleProjects(db(), await insertUser())).toEqual([]);
  });
});

describe("findAccessibleProject", () => {
  it("returns my project", async () => {
    const me = await insertUser();
    const project = await insertProject(db(), { ownerId: me, name: "mine" });

    expect(await findAccessibleProject(db(), me, project.id)).toEqual(project);
  });

  it("returns undefined for another user's project", async () => {
    const [me, other] = [await insertUser(), await insertUser()];
    const theirs = await insertProject(db(), { ownerId: other, name: "theirs" });

    expect(await findAccessibleProject(db(), me, theirs.id)).toBeUndefined();
  });

  it("returns undefined for a random UUID", async () => {
    expect(await findAccessibleProject(db(), await insertUser(), randomUUID())).toBeUndefined();
  });

  it("matches the uppercase form of the ID and returns the lowercase id", async () => {
    const me = await insertUser();
    const project = await insertProject(db(), { ownerId: me, name: "mine" });

    const found = await findAccessibleProject(db(), me, project.id.toUpperCase());

    expect(found?.id).toBe(project.id);
    expect(found?.id).toBe(found?.id.toLowerCase());
  });
});

describe("countAccessibleProjects", () => {
  it("counts only the caller's projects", async () => {
    const [me, other] = [await insertUser(), await insertUser()];
    await insertProject(db(), { ownerId: me, name: "a" });
    await insertProject(db(), { ownerId: me, name: "b" });
    await insertProject(db(), { ownerId: other, name: "c" });

    expect(await countAccessibleProjects(db(), me)).toBe(2);
    expect(await countAccessibleProjects(db(), await insertUser())).toBe(0);
  });
});

describe("renameProject", () => {
  it("changes the name and bumps updatedAt, keeping createdAt", async () => {
    const me = await insertUser();
    const project = await insertProject(db(), { ownerId: me, name: "old" });

    const renamed = await renameProject(db(), project.id, "new");

    expect(renamed?.name).toBe("new");
    expect(renamed?.createdAt).toEqual(project.createdAt);
    expect(renamed!.updatedAt.getTime()).toBeGreaterThan(project.updatedAt.getTime());
  });

  it("returns undefined for a missing project", async () => {
    expect(await renameProject(db(), randomUUID(), "x")).toBeUndefined();
  });
});

describe("deleteProject", () => {
  it("deletes the row and returns true", async () => {
    const me = await insertUser();
    const project = await insertProject(db(), { ownerId: me, name: "gone" });

    expect(await deleteProject(db(), project.id)).toBe(true);
    expect(await findAccessibleProject(db(), me, project.id)).toBeUndefined();
  });

  it("returns false for a missing row", async () => {
    expect(await deleteProject(db(), randomUUID())).toBe(false);
  });
});

// Access is decided in project-access.ts only; insertProject is the one write that names the owner.
// see PITFALLS.md: Project access goes through one condition
describe("owner_id stays out of the repositories", () => {
  const OWNER = /ownerId|owner_id/;
  const dir = import.meta.dirname;
  const sources = readdirSync(dir).filter(
    (file) => file.endsWith(".ts") && !file.endsWith(".test.ts"),
  );

  it("is named only in project-access.ts and projects.ts", () => {
    const naming = sources.filter((file) => OWNER.test(readFileSync(`${dir}/${file}`, "utf8")));
    expect(naming.sort()).toEqual(["project-access.ts", "projects.ts"]);
  });

  it("is named in projects.ts only inside insertProject", () => {
    const text = readFileSync(`${dir}/projects.ts`, "utf8");
    const others = text.slice(text.indexOf("export function listAccessibleProjects"));
    expect(OWNER.test(others)).toBe(false);
  });
});
