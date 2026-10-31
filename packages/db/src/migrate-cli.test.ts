import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, inject, it } from "vitest";

const run = promisify(execFile);
// what production runs; the test script builds first
const CLI = fileURLToPath(new URL("../dist/migrate-cli.js", import.meta.url));

async function runCli(databaseUrl: string) {
  try {
    await run("node", [CLI], { env: { ...process.env, DATABASE_URL: databaseUrl } });
    return { code: 0, stderr: "" };
  } catch (error) {
    const { code, stderr } = error as { code: number; stderr: string };
    return { code, stderr };
  }
}

describe("migrate CLI failures", () => {
  it("says the server refused the connection, without the password", async () => {
    const { code, stderr } = await runCli("postgres://gw:SECRETPW@127.0.0.1:1/gw");
    expect(code).toBe(1);
    expect(stderr).not.toContain("SECRETPW");
    expect(stderr).toMatch(/ECONNREFUSED|refused/i);
  });

  it("names the user for a wrong password, without the password", async () => {
    const url = new URL(inject("testPostgres").adminUrl);
    url.password = "WRONGSECRET";
    const { code, stderr } = await runCli(url.toString());
    expect(code).toBe(1);
    expect(stderr).not.toContain("WRONGSECRET");
    expect(stderr).toContain(`password authentication failed for user "${url.username}"`);
  });
});
