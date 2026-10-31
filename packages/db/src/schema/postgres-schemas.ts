// Postgres schemas from docs/architecture/data-model.md; "auth" is declared in the generated auth.ts
import { pgSchema } from "drizzle-orm/pg-core";

export const appSchema = pgSchema("app");
export const logsSchema = pgSchema("logs");
