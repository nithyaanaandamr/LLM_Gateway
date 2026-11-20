import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "./config.ts";

const SECRET = "test-secret-test-secret-test-secret-0123";
const DATABASE_URL = "postgres://gateway:db-password-9f2c@localhost:5432/gateway";

// Valid values for every required var; tests override or remove one
const VALID_ENV = {
  ADMIN_API_PORT: "8081",
  DATABASE_URL,
  BETTER_AUTH_SECRET: SECRET,
  BETTER_AUTH_URL: "http://localhost:8081",
  DASHBOARD_ORIGIN: "http://localhost:5173",
};

function envWith(
  overrides: Record<string, string | undefined>,
): Record<string, string | undefined> {
  return { ...VALID_ENV, ...overrides };
}

function problemsFor(env: Record<string, string | undefined>): string[] {
  try {
    loadConfig(env);
  } catch (e) {
    if (e instanceof ConfigError) return e.problems;
    throw e;
  }
  throw new Error("expected loadConfig to throw");
}

describe("loadConfig", () => {
  it("applies defaults for a minimal env", () => {
    expect(loadConfig(VALID_ENV)).toEqual({
      port: 8081,
      host: "127.0.0.1",
      logLevel: "info",
      databaseUrl: DATABASE_URL,
      authSecret: SECRET,
      authBaseUrl: "http://localhost:8081",
      dashboardOrigin: "http://localhost:5173",
    });
  });

  it("uses the port, host and log level when set", () => {
    const env = envWith({ ADMIN_API_PORT: "9000", ADMIN_API_HOST: "0.0.0.0", LOG_LEVEL: "debug" });
    expect(loadConfig(env)).toMatchObject({ port: 9000, host: "0.0.0.0", logLevel: "debug" });
  });

  it.each([
    ["missing", {}],
    ["empty", { ADMIN_API_PORT: "" }],
  ])("reports a %s port as required", (_name, env) => {
    expect(problemsFor(env)).toContain("ADMIN_API_PORT: is required");
  });

  it.each(["80x", "0x50", "99999", "-1"])("rejects port %j", (port) => {
    const problems = problemsFor(envWith({ ADMIN_API_PORT: port }));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^ADMIN_API_PORT: /);
  });

  it("allows port 0", () => {
    expect(loadConfig(envWith({ ADMIN_API_PORT: "0" })).port).toBe(0);
  });

  it("treats an empty host as unset and uses the default", () => {
    expect(loadConfig(envWith({ ADMIN_API_HOST: "" })).host).toBe("127.0.0.1");
  });

  it("reports every problem together", () => {
    const problems = problemsFor(envWith({ LOG_LEVEL: "loud", ADMIN_API_PORT: undefined }));
    expect(problems).toHaveLength(2);
    expect(problems.map((p) => p.split(":")[0]).sort()).toEqual(["ADMIN_API_PORT", "LOG_LEVEL"]);
  });

  it("formats the error message as a list", () => {
    expect(() => loadConfig(envWith({ ADMIN_API_PORT: undefined }))).toThrow(
      "Invalid configuration. Set these environment variables (local dev: copy .env.example to .env):\n" +
        "  - ADMIN_API_PORT: is required",
    );
  });

  it("never puts received values in the error", () => {
    let message = "";
    try {
      loadConfig(envWith({ LOG_LEVEL: "SENTINEL_9f2c", ADMIN_API_PORT: "SENTINEL_7a1b" }));
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain("ADMIN_API_PORT");
    expect(message).toContain("LOG_LEVEL");
    expect(message).not.toContain("SENTINEL_9f2c");
    expect(message).not.toContain("SENTINEL_7a1b");
  });

  it("ignores unrelated vars", () => {
    expect(loadConfig(envWith({ PATH: "/usr/bin" })).port).toBe(8081);
  });
});

describe("loadConfig: auth and database vars", () => {
  it.each(["DATABASE_URL", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL", "DASHBOARD_ORIGIN"])(
    "reports %s as required when missing or empty",
    (name) => {
      expect(problemsFor(envWith({ [name]: undefined }))).toEqual([`${name}: is required`]);
      expect(problemsFor(envWith({ [name]: "" }))).toEqual([`${name}: is required`]);
    },
  );

  it("rejects a secret under 32 characters", () => {
    expect(problemsFor(envWith({ BETTER_AUTH_SECRET: "x".repeat(31) }))).toEqual([
      "BETTER_AUTH_SECRET: must be at least 32 characters",
    ]);
    expect(loadConfig(envWith({ BETTER_AUTH_SECRET: "x".repeat(32) })).authSecret).toHaveLength(32);
  });

  it.each(["mysql://localhost/db", "localhost:5432/gateway", "not a url"])(
    "rejects DATABASE_URL %j",
    (value) => {
      expect(problemsFor(envWith({ DATABASE_URL: value }))).toEqual([
        "DATABASE_URL: must be a postgres:// or postgresql:// URL",
      ]);
    },
  );

  it("accepts a postgresql:// URL", () => {
    const url = "postgresql://u:p@db.internal:5432/gateway";
    expect(loadConfig(envWith({ DATABASE_URL: url })).databaseUrl).toBe(url);
  });

  it.each(["BETTER_AUTH_URL", "DASHBOARD_ORIGIN"])("rejects a %s that is not an origin", (name) => {
    for (const value of [
      "http://localhost:8081/api",
      "http://localhost:8081/",
      "http://localhost:8081?x=1",
      "localhost:8081",
      "not a url",
    ]) {
      const problems = problemsFor(envWith({ [name]: value }));
      expect(problems).toHaveLength(1);
      expect(problems[0]).toMatch(new RegExp(`^${name}: must be an origin only`));
    }
  });

  it("rejects http:// for BETTER_AUTH_URL on a non-local host", () => {
    expect(problemsFor(envWith({ BETTER_AUTH_URL: "http://admin.example.com" }))).toEqual([
      "BETTER_AUTH_URL: must use https unless the host is localhost or 127.0.0.1",
    ]);
  });

  it.each(["http://localhost:8081", "http://127.0.0.1:8081", "https://admin.example.com"])(
    "accepts BETTER_AUTH_URL %s",
    (value) => {
      expect(loadConfig(envWith({ BETTER_AUTH_URL: value })).authBaseUrl).toBe(value);
    },
  );

  it("never puts the secret or the database URL in an error", () => {
    const env = envWith({
      BETTER_AUTH_SECRET: "short-SECRET_5d3e",
      DATABASE_URL: "mysql://u:SECRET_8c1a@h/db",
    });
    let message = "";
    try {
      loadConfig(env);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain("BETTER_AUTH_SECRET");
    expect(message).toContain("DATABASE_URL");
    expect(message).not.toContain("SECRET_5d3e");
    expect(message).not.toContain("SECRET_8c1a");
  });
});
