// Used only for `generate`; migrations run via src/migrate.ts
// (see PITFALLS.md: Migrations run once, by one process)
// logs.ts is listed on its own: it isn't exported from @gw/db (ADR 0007)
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: ["./src/schema/index.ts", "./src/schema/logs.ts"],
  out: "./migrations",
});
