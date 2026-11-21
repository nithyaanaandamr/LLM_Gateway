// Test-only (excluded from the build). Never import from app code.
import type { Config } from "../config.ts";

// Env vars a spawned server process needs to load the same config.
// Host and log level are left out so the process keeps its defaults (it logs to stdout).
export function testEnv(config: Config): Record<string, string> {
  return {
    ADMIN_API_PORT: String(config.port),
    DATABASE_URL: config.databaseUrl,
    BETTER_AUTH_SECRET: config.authSecret,
    BETTER_AUTH_URL: config.authBaseUrl,
    DASHBOARD_ORIGIN: config.dashboardOrigin,
    MASTER_KEY: config.masterKey.key.export().toString("base64"),
  };
}
