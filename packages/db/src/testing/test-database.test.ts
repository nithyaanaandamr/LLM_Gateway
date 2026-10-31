import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type DbConnection } from "../client.ts";
import { createTestDatabase } from "./index.ts";

describe("createTestDatabase", () => {
  const connections: DbConnection[] = [];
  let urlA: string;
  let urlB: string;

  beforeAll(async () => {
    urlA = await createTestDatabase();
    urlB = await createTestDatabase();
    connections.push(createDb(urlA), createDb(urlB));
  });

  afterAll(async () => {
    await Promise.all(connections.map((connection) => connection.close()));
  });

  it("clones the migrated template (schemas exist)", async () => {
    const result = await connections[0]!.db.execute<{ n: number }>(
      sql`select count(*)::int as n from information_schema.schemata where schema_name in ('app', 'auth', 'logs')`,
    );
    expect(result.rows[0]?.n).toBe(3);
  });

  it("returns different URLs", () => {
    expect(urlA).not.toBe(urlB);
  });

  it("isolates databases from each other", async () => {
    await connections[0]!.db.execute(sql`create table app.probe (id int)`);
    const result = await connections[1]!.db.execute<{ t: string | null }>(
      sql`select to_regclass('app.probe') as t`,
    );
    expect(result.rows[0]?.t).toBeNull();
  });
});
