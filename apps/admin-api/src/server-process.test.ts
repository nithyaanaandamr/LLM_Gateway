import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const FIXTURE = fileURLToPath(new URL("./test-server.fixture.ts", import.meta.url));
const LISTENING = /Server listening at http:\/\/127\.0\.0\.1:(\d+)/;
type Proc = {
  child: ChildProcess;
  exited: Promise<number | null>;
  out: () => string;
};
const running: Proc[] = [];

function start(env: Record<string, string>): Proc {
  const child = spawn(process.execPath, [FIXTURE], {
    env: { PATH: process.env.PATH ?? "", ADMIN_API_PORT: "0", ...env },
  });
  let out = "";
  child.stdout.on("data", (d: Buffer) => (out += d.toString()));
  const exited = new Promise<number | null>((r) => child.on("exit", (c) => r(c)));
  const p = { child, exited, out: () => out };
  running.push(p);
  return p;
}

async function listening(env: Record<string, string> = {}) {
  const p = start(env);
  const deadline = Date.now() + 8000;
  while (!LISTENING.test(p.out())) {
    if (Date.now() > deadline || p.child.exitCode !== null) throw new Error("no start: " + p.out());
    await new Promise((r) => setTimeout(r, 25));
  }
  const port = LISTENING.exec(p.out())?.[1] ?? "";
  return { ...p, url: `http://127.0.0.1:${port}` };
}

const lines = (out: string) =>
  out
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Record<string, unknown>);

afterEach(async () => {
  for (const p of running.splice(0)) {
    if (p.child.exitCode === null) p.child.kill("SIGKILL");
    await p.exited;
  }
});

describe("real process: logging and shutdown", { timeout: 15_000 }, () => {
  it("5xx: client sees nothing internal, log has the full error with the same requestId", async () => {
    const p = await listening();
    const res = await fetch(`${p.url}/boom`);
    const body = await res.text();
    expect(res.status).toBe(500);
    expect(body).not.toMatch(/hunter2|secret|file\.ts|stack/);
    const requestId = (JSON.parse(body) as { error: { requestId: string } }).error.requestId;
    p.child.kill("SIGTERM");
    await p.exited;
    const failed = lines(p.out()).find((l) => l.msg === "request failed");
    expect(failed?.level).toBe(50);
    expect(JSON.stringify(failed)).toContain("hunter2");
    expect(failed?.reqId).toBe(requestId);
  });

  it("redacts authorization and cookie when a handler logs request.headers", async () => {
    const p = await listening();
    await fetch(`${p.url}/log-headers`, {
      headers: { authorization: "Bearer SENTINEL_AUTH", cookie: "sid=SENTINEL_COOKIE" },
    });
    p.child.kill("SIGTERM");
    await p.exited;
    expect(p.out()).toContain("[redacted]");
    expect(p.out()).not.toContain("SENTINEL");
  });

  it("default request logs carry no headers; /health makes no request logs at info", async () => {
    const p = await listening();
    await fetch(`${p.url}/health`, { headers: { authorization: "Bearer SENTINEL_AUTH" } });
    await fetch(`${p.url}/nope`, { headers: { authorization: "Bearer SENTINEL_AUTH" } });
    p.child.kill("SIGTERM");
    await p.exited;
    expect(p.out()).not.toContain("SENTINEL");
    const reqs = lines(p.out()).filter((l) => l.req ?? l.res);
    expect(reqs.length).toBeGreaterThan(0); // /nope is logged
    expect(JSON.stringify(reqs)).not.toContain("/health");
  });

  it("ignores a client-sent x-request-id", async () => {
    const p = await listening();
    const res = await fetch(`${p.url}/nope`, { headers: { "x-request-id": "evil-id" } });
    const body = await res.text();
    expect(body).not.toContain("evil-id");
    p.child.kill("SIGTERM");
    await p.exited;
    expect(p.out()).not.toContain("evil-id");
  });

  it("finishes an in-flight request when SIGTERM arrives", async () => {
    const p = await listening();
    const inFlight = fetch(`${p.url}/slow`).then(async (r) => ({ s: r.status, b: await r.text() }));
    await new Promise((r) => setTimeout(r, 200));
    p.child.kill("SIGTERM");
    expect(await inFlight).toEqual({ s: 200, b: '{"done":true}' });
    // A keep-alive connection busy at SIGTERM must close after its response (Docker kills at 10 s)
    const exit = await Promise.race([
      p.exited,
      new Promise((r) => setTimeout(() => r("slow"), 5000)),
    ]);
    expect(exit).toBe(0);
  });

  it("stops accepting connections after shutdown", async () => {
    const p = await listening();
    p.child.kill("SIGTERM");
    expect(await p.exited).toBe(0);
    await expect(fetch(`${p.url}/health`)).rejects.toThrow();
  });
});
