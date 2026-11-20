import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type DbConnection } from "./client.ts";
import { insertProject } from "./repositories/projects.ts";
import { projects, users } from "./schema/index.ts";
import { createTestDatabase } from "./testing/index.ts";
import { isUniqueViolation } from "./unique-violation.ts";

const NAME_CONSTRAINT = "projects_owner_id_name_unique";

let connection: DbConnection;
let ownerId: string;

beforeAll(async () => {
  connection = createDb(await createTestDatabase());
  const [user] = await connection.db
    .insert(users)
    .values({ name: "Test", email: `${randomUUID()}@example.com` })
    .returning();
  ownerId = user!.id;
});

afterAll(() => connection.close());

async function caught(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error("expected the call to fail");
}

describe("isUniqueViolation", () => {
  it("is true for a duplicate (owner_id, name) insert", async () => {
    await insertProject(connection.db, ownerId, "dup");

    const error = await caught(() => insertProject(connection.db, ownerId, "dup"));

    expect(isUniqueViolation(error, NAME_CONSTRAINT)).toBe(true);
  });

  it("is false for another unique constraint (the primary key)", async () => {
    const first = await insertProject(connection.db, ownerId, "pk");

    const error = await caught(() =>
      connection.db.insert(projects).values({ id: first.id, ownerId, name: "pk2" }),
    );

    expect(isUniqueViolation(error, "projects_pkey")).toBe(true);
    expect(isUniqueViolation(error, NAME_CONSTRAINT)).toBe(false);
  });

  it("is false for a database error that is not a unique violation", async () => {
    const error = await caught(() => connection.db.execute(sql`select 1 / 0`));

    expect(isUniqueViolation(error, NAME_CONSTRAINT)).toBe(false);
  });

  it("is false for non-DB errors and non-errors", () => {
    expect(isUniqueViolation(new Error("boom"), NAME_CONSTRAINT)).toBe(false);
    expect(isUniqueViolation(undefined, NAME_CONSTRAINT)).toBe(false);
    expect(isUniqueViolation("23505", NAME_CONSTRAINT)).toBe(false);
  });

  it("stops on a cause loop", () => {
    const loop: { cause?: unknown } = {};
    loop.cause = loop;

    expect(isUniqueViolation(loop, NAME_CONSTRAINT)).toBe(false);
  });
});
