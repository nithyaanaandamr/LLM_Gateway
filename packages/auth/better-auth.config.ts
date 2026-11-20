// For the Better Auth CLI only (pnpm auth:generate). Generating reads the config and never
// queries, so it gets Drizzle's connection-less instance: no DATABASE_URL, no secret.
import { schema } from "@gw/db";
import { betterAuth } from "better-auth";
import { drizzle } from "drizzle-orm/node-postgres";
import { tableOptions } from "./src/table-options.ts";

export const auth = betterAuth(tableOptions(drizzle.mock({ schema })));
