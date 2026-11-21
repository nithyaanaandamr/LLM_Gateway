// Test-only (excluded from the build). Starts a script as a real server process.
import { spawn, type ChildProcess } from "node:child_process";

const LISTENING = /Server listening at http:\/\/127\.0\.0\.1:(\d+)/;

export interface ServerProcess {
  child: ChildProcess;
  exited: Promise<number | null>;
  out: () => string;
  err: () => string;
}

export type ListeningServer = ServerProcess & { url: string };

const running: ServerProcess[] = [];

// `script` is a .ts file Node runs directly; `env` is the whole environment (plus PATH)
export function startServer(script: string, env: Record<string, string>): ServerProcess {
  const child = spawn(process.execPath, [script], {
    env: { PATH: process.env.PATH ?? "", ...env },
  });
  let out = "";
  let err = "";
  child.stdout.on("data", (d: Buffer) => (out += d.toString()));
  child.stderr.on("data", (d: Buffer) => (err += d.toString()));
  const exited = new Promise<number | null>((r) => child.on("exit", (c) => r(c)));
  const server = { child, exited, out: () => out, err: () => err };
  running.push(server);
  return server;
}

// Starts the process and waits until it prints its listening line
export async function startListening(
  script: string,
  env: Record<string, string>,
): Promise<ListeningServer> {
  const server = startServer(script, env);
  const deadline = Date.now() + 8000;
  while (!LISTENING.test(server.out())) {
    if (Date.now() > deadline || server.child.exitCode !== null) {
      throw new Error("no start: " + server.out());
    }
    await new Promise((r) => setTimeout(r, 25));
  }
  const port = LISTENING.exec(server.out())?.[1] ?? "";
  return { ...server, url: `http://127.0.0.1:${port}` };
}

// SIGTERM, then wait for the exit; returns the exit code
export async function stopServer(server: ServerProcess): Promise<number | null> {
  server.child.kill("SIGTERM");
  return server.exited;
}

// For afterEach: kill every process this file started
export async function killAllServers(): Promise<void> {
  for (const server of running.splice(0)) {
    if (server.child.exitCode === null) server.child.kill("SIGKILL");
    await server.exited;
  }
}

// stdout of the server, one parsed JSON log line each
export function logLines(out: string): Record<string, unknown>[] {
  return out
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}
