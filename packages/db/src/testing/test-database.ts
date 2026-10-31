import { randomUUID } from "node:crypto";
import pg from "pg";
import { inject } from "vitest";
import { replaceDatabaseName } from "./database-url.ts";
import type { TestPostgres } from "./provided-context.ts";

export interface TestDatabaseOptions {
  migrated?: boolean; // default true; false gives an empty database
}

// Returns the URL of a new database cloned from the migrated template (or a blank one)
export async function createTestDatabase(options: TestDatabaseOptions = {}): Promise<string> {
  const { adminUrl, templateDatabase }: TestPostgres = inject("testPostgres");
  const name = `test_${randomUUID().replaceAll("-", "")}`;
  const template = options.migrated === false ? "template0" : templateDatabase;
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  try {
    // Names are generated here, never user input, so building the SQL text is safe
    await client.query(`CREATE DATABASE "${name}" TEMPLATE "${template}"`);
  } finally {
    await client.end();
  }
  return replaceDatabaseName(adminUrl, name);
}
