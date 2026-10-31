import { z } from "zod";

export const LOG_LEVELS = ["fatal", "error", "warn", "info", "debug", "trace", "silent"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export type Config = { port: number; host: string; logLevel: LogLevel };

const PORT_RULE = "must be a whole number from 0 to 65535";

// Keys are env var names, so error paths are the var names
const envSchema = z.object({
  ADMIN_API_PORT: z
    .string({ error: "is required" })
    .regex(/^\d{1,5}$/, PORT_RULE)
    .transform(Number)
    .pipe(z.number().max(65535, PORT_RULE)),
  ADMIN_API_HOST: z.string().default("127.0.0.1"),
  LOG_LEVEL: z.enum(LOG_LEVELS).default("info"),
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
  const { ADMIN_API_PORT, ADMIN_API_HOST, LOG_LEVEL } = parsed.data;
  return { port: ADMIN_API_PORT, host: ADMIN_API_HOST, logLevel: LOG_LEVEL };
}
