import { createHmac } from "node:crypto";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { COOKIE_WITH_VALUE, forms, request, sessionCookieOf } from "./testing/fetch-requests.ts";
import { killAllServers, logLines, startListening, stopServer } from "./testing/server-process.ts";
import { testConfig } from "./testing/test-config.ts";
import { testEnv } from "./testing/test-env.ts";

const FIXTURE = fileURLToPath(new URL("./test-server.fixture.ts", import.meta.url));

// Env for the spawned server: fresh database, random secret
let baseEnv: Record<string, string>;

beforeAll(async () => {
  baseEnv = testEnv(await testConfig());
});

function listening(env: Record<string, string> = {}) {
  return startListening(FIXTURE, { ...baseEnv, ...env });
}

afterEach(killAllServers);

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
    const failed = logLines(p.out()).find((l) => l.msg === "request failed");
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
    const reqs = logLines(p.out()).filter((l) => l.req ?? l.res);
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

// ---- Secrets and personal data stay out of the logs ----

const PASSWORD = "correct-horse-battery";
const EMAIL = "realproc@example.com";
const NAME = "Real Process";
const SESSION_COOKIE_NAME = "better-auth.session_token";
type Json = Record<string, unknown>;

// JSON POST with the dashboard Origin, which Better Auth and requireTrustedOrigin require
function post(url: string, path: string, body?: Json, cookie?: string) {
  return request(`${url}${path}`, {
    method: "POST",
    origin: baseEnv["DASHBOARD_ORIGIN"] ?? "",
    body,
    cookie,
  });
}

// What a real cookie looks like: <token>.<base64 HMAC-SHA256 of the token>, URL-encoded.
// A made-up token with a correct signature gets past the signature check and reaches the DB.
function signedCookie(token: string, secret: string): string {
  const signature = createHmac("sha256", secret).update(token).digest("base64");
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(`${token}.${signature}`)}`;
}

// A TCP port nothing listens on: bind to a free port, then release it
async function closedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  await new Promise((r) => server.close(r));
  return port;
}

describe("real process: no secrets or personal data in logs", { timeout: 30_000 }, () => {
  it("auth flow over real HTTP: nothing sensitive on stdout or stderr", async () => {
    const p = await listening();
    const cookies: string[] = [];

    const signUp = await post(p.url, "/api/auth/sign-up/email", {
      name: NAME,
      email: EMAIL,
      password: PASSWORD,
    });
    expect(signUp.status).toBe(200);
    cookies.push(sessionCookieOf(signUp));
    const wrong = await post(p.url, "/api/auth/sign-in/email", {
      email: EMAIL,
      password: "wrong-password-123",
    });
    expect(wrong.status).toBe(401);
    const signIn = await post(p.url, "/api/auth/sign-in/email", {
      email: EMAIL,
      password: PASSWORD,
    });
    expect(signIn.status).toBe(200);
    const cookie = sessionCookieOf(signIn);
    cookies.push(cookie);
    const me = await fetch(`${p.url}/api/me`, { headers: { cookie } });
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ email: EMAIL });
    const signOut = await post(p.url, "/api/auth/sign-out", undefined, cookie);
    expect(signOut.status).toBe(200);
    await stopServer(p);

    const output = p.out() + p.err();
    const token = ((await signIn.json()) as { token: string }).token;
    const secrets = [PASSWORD, "wrong-password-123", baseEnv["BETTER_AUTH_SECRET"] ?? "", token];
    for (const cookieValue of cookies) secrets.push(...forms(cookieValue.split("=")[1] ?? ""));
    for (const secret of secrets) expect(output).not.toContain(secret);
    expect(output).not.toMatch(COOKIE_WITH_VALUE);
    expect(p.err()).toBe("");
    // Better Auth's own warning comes out as a pino JSON line (every stdout line must parse)
    const invalid = logLines(p.out()).find((l) => l.msg === "Invalid password");
    expect(invalid).toMatchObject({ level: 40 });
  });

  it("database down: errors are logged as type and code, with no query params", async () => {
    const dbPassword = "DBPASSWORD-sentinel-7f3a";
    const databaseUrl = `postgres://gw_user:${dbPassword}@127.0.0.1:${await closedPort()}/gw`;
    const p = await listening({ DATABASE_URL: databaseUrl });
    const token = "MADEUPTOKEN0123456789abcdefghijkl";
    const cookie = signedCookie(token, baseEnv["BETTER_AUTH_SECRET"] ?? "");

    const signUp = await post(p.url, "/api/auth/sign-up/email", {
      name: NAME,
      email: EMAIL,
      password: PASSWORD,
    });
    const signIn = await post(p.url, "/api/auth/sign-in/email", {
      email: EMAIL,
      password: PASSWORD,
    });
    const me = await fetch(`${p.url}/api/me`, { headers: { cookie } });
    await stopServer(p);

    expect([signUp.status, signIn.status, me.status]).toEqual([500, 500, 500]);
    const output = p.out() + p.err();
    const secrets = [EMAIL, PASSWORD, dbPassword, token, ...forms(cookie.split("=")[1] ?? "")];
    for (const secret of secrets) expect(output).not.toContain(secret);
    expect(output).not.toMatch(COOKIE_WITH_VALUE);
    expect(p.err()).toBe("");
    // Still useful: each failed request has an error line with the type and code
    for (const res of [signUp, signIn, me]) {
      const { requestId } = ((await res.json()) as { error: { requestId: string } }).error;
      const failed = logLines(p.out()).find((l) => l.reqId === requestId && l.level === 50);
      expect(failed?.err).toEqual({ type: "DrizzleQueryError", code: "ECONNREFUSED" });
    }
  });
});
