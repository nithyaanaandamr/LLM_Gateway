import { z } from "zod";

export const LOG_LEVELS = ["fatal", "error", "warn", "info", "debug", "trace", "silent"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export type Config = {
  port: number;
  host: string;
  logLevel: LogLevel;
  databaseUrl: string;
  authSecret: string;
  authBaseUrl: string;
  dashboardOrigin: string;
};

const PORT_RULE = "must be a whole number from 0 to 65535";
const ORIGIN_RULE =
  "must be an origin only (lowercase scheme://host[:port], no default port, no path), e.g. http://localhost:5173";
const ORIGIN_SCHEME_RULE = "must use http or https";
const HTTPS_RULE = "must use https unless the host is localhost or 127.0.0.1";
const POSTGRES_RULE = "must be a postgres:// or postgresql:// URL with a host";
const SECRET_WHITESPACE_RULE = "must not start or end with whitespace";
const MIN_SECRET_LENGTH = 32;
const LOCAL_HOSTS = ["localhost", "127.0.0.1"];

// Validators and their messages never repeat the value
// see PITFALLS.md: Database URL holds the password

// Whitespace anywhere makes pg parse the URL wrongly, so it is rejected, not trimmed
function isPostgresUrl(value: string): boolean {
  if (/\s/.test(value)) return false;
  try {
    const { protocol, hostname } = new URL(value);
    return (protocol === "postgres:" || protocol === "postgresql:") && hostname !== "";
  } catch {
    return false;
  }
}

function hasNoOuterWhitespace(value: string): boolean {
  return value === value.trim();
}

// Normalised form equals the input: lowercase, no default port, no path, query or trailing slash
function isOriginOnly(value: string): boolean {
  try {
    return new URL(value).origin === value;
  } catch {
    return false;
  }
}

function isHttpOrHttps(value: string): boolean {
  const { protocol } = new URL(value);
  return protocol === "http:" || protocol === "https:";
}

// Browsers only store Secure cookies over https, so non-local hosts must use it
function isHttpsOrLocal(value: string): boolean {
  const { protocol, hostname } = new URL(value);
  return protocol === "https:" || LOCAL_HOSTS.includes(hostname);
}

// Both origin vars: valid origin, http(s), https unless local.
// abort: skip later checks on a value that is not a usable origin
const originSchema = z
  .string({ error: "is required" })
  .refine(isOriginOnly, { error: ORIGIN_RULE, abort: true })
  .refine(isHttpOrHttps, { error: ORIGIN_SCHEME_RULE, abort: true })
  .refine(isHttpsOrLocal, HTTPS_RULE);

// Keys are env var names, so error paths are the var names
const envSchema = z.object({
  ADMIN_API_PORT: z
    .string({ error: "is required" })
    .regex(/^\d{1,5}$/, PORT_RULE)
    .transform(Number)
    .pipe(z.number().max(65535, PORT_RULE)),
  ADMIN_API_HOST: z.string().default("127.0.0.1"),
  LOG_LEVEL: z.enum(LOG_LEVELS).default("info"),
  DATABASE_URL: z.string({ error: "is required" }).refine(isPostgresUrl, POSTGRES_RULE),
  BETTER_AUTH_SECRET: z
    .string({ error: "is required" })
    .min(MIN_SECRET_LENGTH, `must be at least ${MIN_SECRET_LENGTH} characters`)
    .refine(hasNoOuterWhitespace, SECRET_WHITESPACE_RULE),
  BETTER_AUTH_URL: originSchema,
  DASHBOARD_ORIGIN: originSchema,
});

export class ConfigError extends Error {
  readonly problems: string[];

  constructor(problems: string[]) {
    super(
      "Invalid configuration. Set these environment variables (local dev: copy .env.example to .env):\n" +
        problems.map((p) => `  - ${p}`).join("\n"),
    );
    this.name = "ConfigError";
    this.problems = problems;
  }
}

// see PITFALLS.md: Empty env vars count as missing
function withoutEmptyValues(env: Record<string, string | undefined>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined && value !== "") result[key] = value;
  }
  return result;
}

export function loadConfig(env: Record<string, string | undefined>): Config {
  const parsed = envSchema.safeParse(withoutEmptyValues(env));
  if (!parsed.success) {
    throw new ConfigError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
  }
  const data = parsed.data;
  return {
    port: data.ADMIN_API_PORT,
    host: data.ADMIN_API_HOST,
    logLevel: data.LOG_LEVEL,
    databaseUrl: data.DATABASE_URL,
    authSecret: data.BETTER_AUTH_SECRET,
    authBaseUrl: data.BETTER_AUTH_URL,
    dashboardOrigin: data.DASHBOARD_ORIGIN,
  };
}
