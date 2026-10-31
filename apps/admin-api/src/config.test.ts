import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "./config.ts";

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
    expect(loadConfig({ ADMIN_API_PORT: "8081" })).toEqual({
      port: 8081,
      host: "127.0.0.1",
      logLevel: "info",
    });
  });

  it("uses all three values when set", () => {
    const env = { ADMIN_API_PORT: "9000", ADMIN_API_HOST: "0.0.0.0", LOG_LEVEL: "debug" };
    expect(loadConfig(env)).toEqual({ port: 9000, host: "0.0.0.0", logLevel: "debug" });
  });

  it.each([
    ["missing", {}],
    ["empty", { ADMIN_API_PORT: "" }],
  ])("reports a %s port as required", (_name, env) => {
    expect(problemsFor(env)).toContain("ADMIN_API_PORT: is required");
  });

  it.each(["80x", "0x50", "99999", "-1"])("rejects port %j", (port) => {
    const problems = problemsFor({ ADMIN_API_PORT: port });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^ADMIN_API_PORT: /);
  });

  it("allows port 0", () => {
    expect(loadConfig({ ADMIN_API_PORT: "0" }).port).toBe(0);
  });

  it("treats an empty host as unset and uses the default", () => {
    expect(loadConfig({ ADMIN_API_PORT: "1", ADMIN_API_HOST: "" }).host).toBe("127.0.0.1");
  });

  it("reports every problem together", () => {
    const problems = problemsFor({ LOG_LEVEL: "loud" });
    expect(problems).toHaveLength(2);
    expect(problems.map((p) => p.split(":")[0]).sort()).toEqual(["ADMIN_API_PORT", "LOG_LEVEL"]);
  });

  it("formats the error message as a list", () => {
    expect(() => loadConfig({})).toThrow(
      "Invalid configuration. Set these environment variables (local dev: copy .env.example to .env):\n" +
        "  - ADMIN_API_PORT: is required",
    );
  });

  it("never puts received values in the error", () => {
    let message = "";
    try {
      loadConfig({ LOG_LEVEL: "SENTINEL_9f2c", ADMIN_API_PORT: "SENTINEL_7a1b" });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain("ADMIN_API_PORT");
    expect(message).toContain("LOG_LEVEL");
    expect(message).not.toContain("SENTINEL_9f2c");
    expect(message).not.toContain("SENTINEL_7a1b");
  });

  it("ignores unrelated vars", () => {
    expect(loadConfig({ ADMIN_API_PORT: "1", PATH: "/usr/bin" }).port).toBe(1);
  });
});
