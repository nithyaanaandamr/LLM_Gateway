import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

// what production runs; the test script builds first
const MAIN = fileURLToPath(new URL("../dist/main.js", import.meta.url));
const LISTENING = /Server listening at http:\/\/127\.0\.0\.1:(\d+)/;

const children: ChildProcess[] = [];

// Placeholder values for the vars config now requires; nothing connects to them yet
const REQUIRED_ENV = {
  DATABASE_URL: "postgres://placeholder@localhost:5432/placeholder",
  BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-0123",
  BETTER_AUTH_URL: "http://localhost:8081",
  DASHBOARD_ORIGIN: "http://localhost:5173",
};

afterEach(() => {
  for (const child of children.splice(0)) child.kill("SIGKILL");
});

function start(overrides: Record<string, string>) {
  const child = spawn(process.execPath, [MAIN], {
    env: { PATH: process.env.PATH ?? "", ...overrides },
  });
  children.push(child);
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
  child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
  const exited = new Promise<number | null>((resolve) => child.on("exit", (code) => resolve(code)));
  return { child, exited, out: () => stdout, err: () => stderr };
}

async function waitFor(test: () => boolean, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!test()) {
    if (Date.now() > deadline) throw new Error("timed out waiting for condition");
    await new Promise((r) => setTimeout(r, 25));
  }
}

async function startListening(
  env: Record<string, string> = { ADMIN_API_PORT: "0", ...REQUIRED_ENV },
) {
  const p = start(env);
  await waitFor(() => p.out().includes("Server listening"));
  return p;
}

describe("main (real process)", { timeout: 10_000 }, () => {
  it.each(["SIGTERM", "SIGINT"] as const)("shuts down cleanly on %s", async (signal) => {
    const p = await startListening();
    p.child.kill(signal); // once only: a second signal kills the process
    expect(await p.exited).toBe(0);
    expect(p.out()).toContain("shutting down");
  });

  it("exits 1 naming the missing var", async () => {
    const p = start({});
    expect(await p.exited).toBe(1);
    expect(p.err()).toContain("ADMIN_API_PORT: is required");
  });

  it("does not print secret values", async () => {
    const p = start({ ADMIN_API_PORT: "SENTINEL_7a1b", ...REQUIRED_ENV });
    expect(await p.exited).toBe(1);
    expect(p.err()).toContain("ADMIN_API_PORT");
    expect(p.err()).not.toContain("SENTINEL_7a1b");
  });

  it("exits 1 when the port is in use", async () => {
    const first = await startListening();
    const port = LISTENING.exec(first.out())?.[1];
    expect(port).toBeDefined();
    const second = start({ ADMIN_API_PORT: port ?? "", ...REQUIRED_ENV });
    expect(await second.exited).toBe(1);
    first.child.kill("SIGTERM");
    expect(await first.exited).toBe(0);
  });
});
