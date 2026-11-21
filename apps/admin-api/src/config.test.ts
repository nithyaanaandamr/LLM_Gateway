import { inspect } from "node:util";
import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "./config.ts";

const SECRET = "test-secret-test-secret-test-secret-0123";
const MASTER_KEY = Buffer.alloc(32, 7).toString("base64");
const DATABASE_URL = "postgres://gateway:db-password-9f2c@localhost:5432/gateway";

// Valid values for every required var; tests override or remove one
const VALID_ENV = {
  ADMIN_API_PORT: "8081",
  DATABASE_URL,
  BETTER_AUTH_SECRET: SECRET,
  BETTER_AUTH_URL: "http://localhost:8081",
  DASHBOARD_ORIGIN: "http://localhost:5173",
  MASTER_KEY,
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
    const { masterKey, ...rest } = loadConfig(VALID_ENV);
    expect(rest).toEqual({
      port: 8081,
      host: "127.0.0.1",
      logLevel: "info",
      databaseUrl: DATABASE_URL,
      authSecret: SECRET,
      authBaseUrl: "http://localhost:8081",
      dashboardOrigin: "http://localhost:5173",
    });
    expect(masterKey.version).toBe(1);
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
  it.each([
    "DATABASE_URL",
    "BETTER_AUTH_SECRET",
    "BETTER_AUTH_URL",
    "DASHBOARD_ORIGIN",
    "MASTER_KEY",
  ])("reports %s as required when missing or empty", (name) => {
    expect(problemsFor(envWith({ [name]: undefined }))).toEqual([`${name}: is required`]);
    expect(problemsFor(envWith({ [name]: "" }))).toEqual([`${name}: is required`]);
  });

  it("rejects a secret under 32 characters", () => {
    expect(problemsFor(envWith({ BETTER_AUTH_SECRET: "x".repeat(31) }))).toEqual([
      "BETTER_AUTH_SECRET: must be at least 32 characters",
    ]);
    expect(loadConfig(envWith({ BETTER_AUTH_SECRET: "x".repeat(32) })).authSecret).toHaveLength(32);
  });

  it("rejects a secret with leading or trailing whitespace, without trimming it", () => {
    const rule = "BETTER_AUTH_SECRET: must not start or end with whitespace";
    expect(problemsFor(envWith({ BETTER_AUTH_SECRET: "  " + "x".repeat(30) }))).toEqual([rule]);
    expect(problemsFor(envWith({ BETTER_AUTH_SECRET: "x".repeat(31) + "\n" }))).toEqual([rule]);
    expect(problemsFor(envWith({ BETTER_AUTH_SECRET: " ".repeat(40) }))).toEqual([rule]);
  });

  it("allows whitespace inside a secret", () => {
    const secret = "correct horse battery staple, 32+";
    expect(loadConfig(envWith({ BETTER_AUTH_SECRET: secret })).authSecret).toBe(secret);
  });

  it.each([
    "mysql://localhost/db",
    "localhost:5432/gateway",
    "not a url",
    " postgres://u:p@h/db",
    "postgres://u:p@h/db ",
    "postgres://u:p@h/db\n",
    "postgres://u:p@h /db",
    "postgres://",
    "postgres:///db",
    "postgres:/x",
    "postgres://u:p@/db",
  ])("rejects DATABASE_URL %j", (value) => {
    expect(problemsFor(envWith({ DATABASE_URL: value }))).toEqual([
      "DATABASE_URL: must be a postgres:// or postgresql:// URL with a host",
    ]);
  });

  // pg falls back to the user name as the database, so a missing database name is allowed
  it.each(["postgresql://h", "postgres://u:p@h:5433", "postgresql://u:p@db.internal:5432/gateway"])(
    "accepts DATABASE_URL %s",
    (url) => {
      expect(loadConfig(envWith({ DATABASE_URL: url })).databaseUrl).toBe(url);
    },
  );

  it.each(["BETTER_AUTH_URL", "DASHBOARD_ORIGIN"])("rejects a %s that is not an origin", (name) => {
    for (const value of [
      "http://localhost:8081/api",
      "http://localhost:8081/",
      "http://localhost:8081?x=1",
      "HTTP://LOCALHOST:8081",
      "https://admin.example.com:443",
      "http://localhost:80",
      "localhost:8081",
      "not a url",
    ]) {
      const problems = problemsFor(envWith({ [name]: value }));
      expect(problems).toHaveLength(1);
      expect(problems[0]).toMatch(new RegExp(`^${name}: must be an origin only`));
    }
  });

  it.each(["BETTER_AUTH_URL", "DASHBOARD_ORIGIN"])("rejects a non-http scheme in %s", (name) => {
    for (const value of ["ftp://x.com", "ws://localhost:8081"]) {
      expect(problemsFor(envWith({ [name]: value }))).toEqual([`${name}: must use http or https`]);
    }
  });

  it.each(["BETTER_AUTH_URL", "DASHBOARD_ORIGIN"])(
    "rejects http:// for %s on a non-local host",
    (name) => {
      expect(problemsFor(envWith({ [name]: "http://app.example.com" }))).toEqual([
        `${name}: must use https unless the host is localhost or 127.0.0.1`,
      ]);
    },
  );

  it.each(["http://localhost:8081", "http://127.0.0.1:8081", "https://admin.example.com"])(
    "accepts BETTER_AUTH_URL %s",
    (value) => {
      expect(loadConfig(envWith({ BETTER_AUTH_URL: value })).authBaseUrl).toBe(value);
    },
  );

  it.each(["http://localhost:5173", "http://127.0.0.1:5173", "https://app.example.com"])(
    "accepts DASHBOARD_ORIGIN %s",
    (value) => {
      expect(loadConfig(envWith({ DASHBOARD_ORIGIN: value })).dashboardOrigin).toBe(value);
    },
  );

  it("never puts the secret or the database URL in an error", () => {
    const env = envWith({
      BETTER_AUTH_SECRET: "short-SECRET_5d3e",
      DATABASE_URL: "mysql://u:SECRET_8c1a@h/db",
      BETTER_AUTH_URL: "http://SECRET_1d4f.example.com/path",
      DASHBOARD_ORIGIN: "ftp://SECRET_2e5a.example.com",
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
    expect(message).not.toContain("SECRET_1d4f");
    expect(message).not.toContain("SECRET_2e5a");
  });
});

describe("loadConfig: MASTER_KEY", () => {
  const RULE = "MASTER_KEY: Invalid master key: ";

  it("loads a valid key as version 1", () => {
    const { masterKey } = loadConfig(envWith({ MASTER_KEY }));
    expect(masterKey.version).toBe(1);
    expect(masterKey.key.export().toString("base64")).toBe(MASTER_KEY);
  });

  it("rejects 31 bytes", () => {
    const problems = problemsFor(envWith({ MASTER_KEY: Buffer.alloc(31, 7).toString("base64") }));
    expect(problems).toEqual([`${RULE}must be 44 base64 characters (32 bytes)`]);
  });

  it("rejects a key with a trailing newline", () => {
    expect(problemsFor(envWith({ MASTER_KEY: MASTER_KEY + "\n" }))).toEqual([
      `${RULE}must be 44 base64 characters (32 bytes)`,
    ]);
  });

  it("rejects a non-canonical spelling (last character has unused bits)", () => {
    // 32 bytes of zeros end in "A="; "B=" decodes to the same bytes
    const canonical = Buffer.alloc(32).toString("base64");
    const sloppy = canonical.slice(0, -2) + "B=";
    expect(problemsFor(envWith({ MASTER_KEY: sloppy }))).toEqual([
      `${RULE}must be canonical base64`,
    ]);
  });

  it("never puts the value in the error", () => {
    const value = "SENTINEL_" + "k".repeat(40);
    let message = "";
    try {
      loadConfig(envWith({ MASTER_KEY: value }));
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain("MASTER_KEY");
    expect(message).not.toContain("SENTINEL_");
  });

  it("inspect(config) does not show the key", () => {
    const shown = inspect(loadConfig(envWith({ MASTER_KEY })), { depth: 5 });
    expect(shown).not.toContain(MASTER_KEY);
    expect(shown).not.toContain(Buffer.alloc(32, 7).toString("hex"));
  });
});
