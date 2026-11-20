import { createAuth, type Auth, type AuthLog } from "@gw/auth";
import type { Database } from "@gw/db";
import type { FastifyBaseLogger } from "fastify";
import type { Config } from "../config.ts";
import { trustedOrigins } from "./trusted-origins.ts";

// Better Auth's `log` hook -> our pino logger. Only the message and an Error are kept;
// other arguments are dropped because they can hold request data such as emails.
export function pinoAuthLog(logger: FastifyBaseLogger): AuthLog {
  return (level, message, ...args) => {
    const err = args.find((arg): arg is Error => arg instanceof Error);
    if (err) logger[level]({ err }, message);
    else logger[level](message);
  };
}

export function createAppAuth(config: Config, db: Database, logger: FastifyBaseLogger): Auth {
  return createAuth({
    db,
    secret: config.authSecret,
    baseURL: config.authBaseUrl,
    trustedOrigins: trustedOrigins(config),
    log: pinoAuthLog(logger),
  });
}
