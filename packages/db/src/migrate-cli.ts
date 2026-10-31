// Applies pending migrations to DATABASE_URL. Run: pnpm db:migrate
import { readDatabaseUrl } from "./config.ts";
import { describeError } from "./error-message.ts";
import { runMigrations } from "./migrate.ts";

try {
  await runMigrations(readDatabaseUrl());
  console.log("Migrations applied");
} catch (error) {
  console.error("Migration failed:", describeError(error));
  process.exitCode = 1;
}
