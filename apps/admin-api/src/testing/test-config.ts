// Test-only (excluded from the build). Never import from app code.
import { randomBytes } from "node:crypto";
import { createTestDatabase } from "@gw/db/testing";
import type { Config } from "../config.ts";

// A full Config for tests: a fresh migrated database, a random secret, no log output
export async function testConfig(overrides: Partial<Config> = {}): Promise<Config> {
  return {
    port: 0,
    host: "127.0.0.1",
    logLevel: "silent",
    databaseUrl: await createTestDatabase(),
    authSecret: randomBytes(32).toString("hex"),
    authBaseUrl: "http://localhost:8081",
    dashboardOrigin: "http://localhost:5173",
    ...overrides,
  };
}
