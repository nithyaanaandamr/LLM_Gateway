import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type { TestProject } from "vitest/node";
import { runMigrations } from "../migrate.ts";
import { replaceDatabaseName } from "./database-url.ts";
import type { TestPostgres } from "./provided-context.ts";

// Keep in sync with infra/compose.yaml
const POSTGRES_IMAGE = "postgres:17-alpine";
const TEMPLATE_DATABASE = "gw_template";

export async function setupTestPostgres(project: TestProject): Promise<() => Promise<void>> {
  const container = await new PostgreSqlContainer(POSTGRES_IMAGE)
    .withDatabase(TEMPLATE_DATABASE)
    .start();
  try {
    await runMigrations(container.getConnectionUri());
  } catch (error) {
    await container.stop();
    throw error;
  }
  const testPostgres: TestPostgres = {
    adminUrl: replaceDatabaseName(container.getConnectionUri(), "postgres"),
    templateDatabase: TEMPLATE_DATABASE,
  };
  project.provide("testPostgres", testPostgres);
  return async () => {
    await container.stop();
  };
}
