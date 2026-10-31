import type { FastifyServerOptions } from "fastify";
import type { Config } from "./config.ts";

// see PITFALLS.md: Log redaction
const REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "headers.authorization",
  "headers.cookie",
  'res.headers["set-cookie"]',
];

export function loggerOptions(config: Pick<Config, "logLevel">) {
  return {
    level: config.logLevel,
    redact: { paths: REDACT_PATHS, censor: "[redacted]" },
  } satisfies FastifyServerOptions["logger"];
}
