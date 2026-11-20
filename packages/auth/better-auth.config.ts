// For the Better Auth CLI only (pnpm auth:generate). Generating reads the config and never
// queries, so it gets Drizzle's connection-less instance: no DATABASE_URL, no secret.
import { schema } from "@gw/db";
import { drizzle } from "drizzle-orm/node-postgres";
import { createAuth } from "./src/create-auth.ts";

export const auth = createAuth({ db: drizzle.mock({ schema }) });
