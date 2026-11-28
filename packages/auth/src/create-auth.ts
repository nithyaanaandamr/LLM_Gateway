import type { Database } from "@gw/db";
import { toDrizzle } from "@gw/db/drizzle";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { CLIENT_IP_HEADER } from "./client-ip-header.ts";
import { tableOptions } from "./table-options.ts";

const SECONDS_PER_DAY = 60 * 60 * 24;

export type AuthLog = NonNullable<NonNullable<BetterAuthOptions["logger"]>["log"]>;

export interface CreateAuthOptions {
  db: Database;
  secret: string;
  baseURL: string;
  trustedOrigins: string[];
  log: AuthLog;
}

export function createAuth({ db, secret, baseURL, trustedOrigins, log }: CreateAuthOptions) {
  const tables = tableOptions(toDrizzle(db));
  return betterAuth({
    ...tables,
    // Explicit values win over the env vars Better Auth reads itself
    // see PITFALLS.md: Better Auth reads env vars by itself
    secret,
    baseURL,
    trustedOrigins,
    emailAndPassword: { enabled: true, minPasswordLength: 8, maxPasswordLength: 128 },
    session: { expiresIn: 7 * SECONDS_PER_DAY, updateAge: SECONDS_PER_DAY },
    rateLimit: { enabled: true },
    advanced: {
      ...tables.advanced,
      // Better Auth skips origin checks under NODE_ENV=test unless this is set
      // see PITFALLS.md: Better Auth turns off origin checks in tests
      disableOriginCheck: false,
      ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
    },
    logger: { level: "warn", log },
    // Without this, a non-API error (e.g. a failed query) is also printed to stderr with its
    // SQL params. With it, the error reaches our error handler, which logs it safely.
    // see PITFALLS.md: Better Auth prints errors to stderr on its own
    onAPIError: { throw: true },
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type AuthSession = Auth["$Infer"]["Session"];
