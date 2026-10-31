import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type DbConnection } from "./client.ts";
import { MIGRATIONS_FOLDER, runMigrations } from "./migrate.ts";
import { createTestDatabase } from "./testing/index.ts";

describe("runMigrations", () => {
  let url: string;
  let connection: DbConnection;

  beforeAll(async () => {
    url = await createTestDatabase({ migrated: false });
    connection = createDb(url);
  });

  afterAll(async () => {
    await connection.close();
  });

  const schemaNames = async () => {
    const result = await connection.db.execute<{ schema_name: string }>(
      sql`select schema_name from information_schema.schemata`,
    );
    return result.rows.map((row) => row.schema_name);
  };

  const appliedCount = async () => {
    const result = await connection.db.execute<{ n: number }>(
      sql`select count(*)::int as n from drizzle.__drizzle_migrations`,
    );
    return result.rows[0]?.n;
  };

  it("creates the schemas, and is a no-op when run again", async () => {
    const before = await schemaNames();
    for (const name of ["app", "auth", "logs"]) expect(before).not.toContain(name);

    await runMigrations(url);
    expect(await schemaNames()).toEqual(expect.arrayContaining(["app", "auth", "logs"]));

    const journal = JSON.parse(
      await readFile(join(MIGRATIONS_FOLDER, "meta/_journal.json"), "utf8"),
    ) as { entries: unknown[] };
    const expected = journal.entries.length;
    expect(await appliedCount()).toBe(expected);

    await expect(runMigrations(url)).resolves.toBeUndefined();
    expect(await appliedCount()).toBe(expected);
  });
});
