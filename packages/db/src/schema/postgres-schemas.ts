// Postgres schemas from docs/architecture/data-model.md; tables are added in GW-014
import { pgSchema } from "drizzle-orm/pg-core";

export const appSchema = pgSchema("app");
export const authSchema = pgSchema("auth");
export const logsSchema = pgSchema("logs");
