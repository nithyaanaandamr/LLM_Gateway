// Used only for `generate`; migrations run via src/migrate.ts
// (see PITFALLS.md: Migrations run once, by one process)
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./migrations",
});
