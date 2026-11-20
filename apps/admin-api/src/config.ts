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
  "must be an origin only (scheme, host, optional port), e.g. http://localhost:8081";
const MIN_SECRET_LENGTH = 32;
const LOCAL_HOSTS = ["localhost", "127.0.0.1"];

// Messages below never repeat the value
// see PITFALLS.md: Database URL holds the password
function isPostgresUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "postgres:" || protocol === "postgresql:";
  } catch {
    return false;
  }
}

function isOriginOnly(value: string): boolean {
  try {
    return new URL(value).origin === value;
  } catch {
    return false;
  }
}

// Browsers only store Secure cookies over https, so non-local hosts must use it
function isHttpsOrLocal(value: string): boolean {
  const { protocol, hostname } = new URL(value);
  return protocol === "https:" || LOCAL_HOSTS.includes(hostname);
}

// abort: skip later checks on a value that is not an origin
const originSchema = z
  .string({ error: "is required" })
  .refine(isOriginOnly, { error: ORIGIN_RULE, abort: true });

// Keys are env var names, so error paths are the var names
const envSchema = z.object({
  ADMIN_API_PORT: z
    .string({ error: "is required" })
    .regex(/^\d{1,5}$/, PORT_RULE)
    .transform(Number)
    .pipe(z.number().max(65535, PORT_RULE)),
  ADMIN_API_HOST: z.string().default("127.0.0.1"),
  LOG_LEVEL: z.enum(LOG_LEVELS).default("info"),
  DATABASE_URL: z
    .string({ error: "is required" })
    .refine(isPostgresUrl, "must be a postgres:// or postgresql:// URL"),
  BETTER_AUTH_SECRET: z
    .string({ error: "is required" })
    .min(MIN_SECRET_LENGTH, `must be at least ${MIN_SECRET_LENGTH} characters`),
  BETTER_AUTH_URL: originSchema.refine(
    isHttpsOrLocal,
    "must use https unless the host is localhost or 127.0.0.1",
  ),
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
