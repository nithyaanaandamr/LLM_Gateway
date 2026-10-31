import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { createDb, type DbConnection } from "./client.ts";
import { createTestDatabase } from "./testing/index.ts";

describe("createDb", () => {
  let connection: DbConnection;

  beforeAll(async () => {
    connection = createDb(await createTestDatabase());
  });

  afterAll(async () => {
    await connection.close().catch(() => undefined);
  });

  it("connects and runs a query, then rejects after close", async () => {
    const result = await connection.db.execute(sql`select 1 as one`);
    expect(result.rows[0]).toEqual({ one: 1 });
    await connection.close();
    await expect(connection.db.execute(sql`select 1`)).rejects.toThrow();
  });
});
