import { createAuth, CLIENT_IP_HEADER } from "@gw/auth";
import { createDb, sessions, type DbConnection } from "@gw/db";
import { toDrizzle } from "@gw/db/testing";
import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type App } from "./app.ts";
import { errorHandler } from "./error-handler.ts";
import { trustedOrigins } from "./auth/trusted-origins.ts";
import type { Config } from "./config.ts";
import { protectScope } from "./protected-api.ts";
import { cookieFrom, signOut, signUp, TEST_PASSWORD, uniqueIp } from "./testing/auth-requests.ts";
import { testConfig } from "./testing/test-config.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const SESSION_COOKIE_SET = /^(__Secure-)?better-auth\.session_token=/;

type ErrorJson = { error: { code: string; message: string; requestId: string } };

let emailCounter = 0;
function newEmail(): string {
  return `me${++emailCounter}@example.com`;
}

function setCookies(res: { headers: Record<string, unknown> }): string[] {
  return [res.headers["set-cookie"]]
    .flat()
    .filter((v) => v !== undefined)
    .map(String);
}

describe("protected scope", () => {
  let config: Config;
  let app: App;
  let connection: DbConnection;

  beforeAll(async () => {
    config = await testConfig();
    app = buildApp(config);
    connection = createDb(config.databaseUrl);
  });

  afterAll(async () => {
    await app.close();
    await connection.close();
  });

  async function signedUp(): Promise<{ email: string; cookie: string; userId: string }> {
    const email = newEmail();
    const res = await signUp(app, config, { name: "Ada", email, password: TEST_PASSWORD });
    expect(res.statusCode).toBe(200);
    return { email, cookie: cookieFrom(res), userId: res.json<{ user: { id: string } }>().user.id };
  }

  function sessionRow(userId: string) {
    return toDrizzle(connection.db)
      .select()
      .from(sessions)
      .where(eq(sessions.userId, userId))
      .then((rows) => rows[0]);
  }

  function setExpiry(userId: string, expiresAt: Date) {
    return toDrizzle(connection.db)
      .update(sessions)
      .set({ expiresAt })
      .where(eq(sessions.userId, userId));
  }

  function me(headers: Record<string, string>) {
    return app.inject({ method: "GET", url: "/api/me", remoteAddress: uniqueIp(), headers });
  }

  describe("GET /api/me", () => {
    it("returns exactly id, email and name for a valid cookie", async () => {
      const { email, cookie, userId } = await signedUp();

      const res = await me({ cookie });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ id: userId, email, name: "Ada" });
    });

    it("answers 401 UNAUTHORIZED in our shape with no cookie", async () => {
      const res = await me({});

      expect(res.statusCode).toBe(401);
      const { error } = res.json<ErrorJson>();
      expect(error).toMatchObject({ code: "UNAUTHORIZED", message: "Not logged in" });
      expect(error.requestId).toMatch(UUID);
    });

    it("answers 401 for a cookie with one changed character", async () => {
      const { cookie } = await signedUp();
      const [name = "", value = ""] = cookie.split("=");
      const first = value.startsWith("a") ? "b" : "a";
      const tampered = `${name}=${first}${value.slice(1)}`;

      expect((await me({ cookie })).statusCode).toBe(200);
      expect((await me({ cookie: tampered })).statusCode).toBe(401);
    });

    it("answers 401 for a gateway key as Bearer token and no cookie", async () => {
      const res = await me({ authorization: "Bearer gw_live_abcdefghijklmnopqrstuvwxyz012345" });
      expect(res.statusCode).toBe(401);
      expect(res.json<ErrorJson>().error.code).toBe("UNAUTHORIZED");
    });

    it("answers 401 for a cookie used after sign-out", async () => {
      const { cookie } = await signedUp();
      expect((await signOut(app, config, { cookie })).statusCode).toBe(200);

      const res = await me({ cookie });

      expect(res.statusCode).toBe(401);
    });

    it("answers 401 with a clearing Set-Cookie for an expired session", async () => {
      const { cookie, userId } = await signedUp();
      await setExpiry(userId, new Date(Date.now() - 1000));

      const res = await me({ cookie });

      expect(res.statusCode).toBe(401);
      const clearing = setCookies(res).find((v) => SESSION_COOKIE_SET.test(v));
      expect(clearing).toMatch(/Max-Age=0/i);
    });
  });

  // Sessions last 7 days and are refreshed once older than 1 day (updateAge)
  describe("sliding refresh", () => {
    it("moves expires_at forward and sends a new cookie once the session is past the refresh point", async () => {
      const { cookie, userId } = await signedUp();
      // 1 minute past the refresh point: the session is just over 1 day old
      const before = new Date(Date.now() + 6 * DAY_MS - 60_000);
      await setExpiry(userId, before);

      const res = await me({ cookie });

      expect(res.statusCode).toBe(200);
      const refreshed = setCookies(res).find((v) => SESSION_COOKIE_SET.test(v));
      expect(refreshed).toMatch(/Max-Age=604800/);
      const row = await sessionRow(userId);
      expect(row?.expiresAt.getTime()).toBeGreaterThan(before.getTime());
      expect(Math.abs((row?.expiresAt.getTime() ?? 0) - (Date.now() + 7 * DAY_MS))).toBeLessThan(
        2 * 60_000,
      );
    });

    it("leaves a session alone and sends no cookie before the refresh point", async () => {
      const { cookie, userId } = await signedUp();
      // 1 hour before the refresh point: the session is just under 1 day old
      const before = new Date(Date.now() + 6 * DAY_MS + 60 * 60_000);
      await setExpiry(userId, before);

      const res = await me({ cookie });

      expect(res.statusCode).toBe(200);
      expect(setCookies(res)).toEqual([]);
      expect((await sessionRow(userId))?.expiresAt.getTime()).toBe(before.getTime());
    });
  });
});

// protectScope on a scope with real routes of every method, backed by real auth and Postgres
describe("protectScope", () => {
  let config: Config;
  let connection: DbConnection;
  let signUpApp: App;
  let scoped: FastifyInstance;

  beforeAll(async () => {
    config = await testConfig();
    signUpApp = buildApp(config);
    connection = createDb(config.databaseUrl);
    const auth = createAuth({
      db: connection.db,
      secret: config.authSecret,
      baseURL: config.authBaseUrl,
      trustedOrigins: trustedOrigins(config),
      log: () => {},
    });
    scoped = Fastify();
    scoped.setErrorHandler(errorHandler);
    void scoped.register((scope, _options, done) => {
      protectScope(scope, { auth, trustedOrigins: trustedOrigins(config) });
      scope.post("/things", () => ({ created: true }));
      scope.get("/things", () => ({ listed: true }));
      done();
    });
  });

  afterAll(async () => {
    await scoped.close();
    await signUpApp.close();
    await connection.close();
  });

  async function cookie(): Promise<string> {
    const res = await signUp(signUpApp, config, {
      name: "Ada",
      email: newEmail(),
      password: TEST_PASSWORD,
    });
    return cookieFrom(res);
  }

  const call = (method: "GET" | "POST", headers: Record<string, string>) =>
    scoped.inject({
      method,
      url: "/things",
      headers: { [CLIENT_IP_HEADER]: "10.0.0.1", ...headers },
    });

  it("lets a logged-in user POST from a trusted Origin", async () => {
    const res = await call("POST", { cookie: await cookie(), origin: config.dashboardOrigin });
    expect(res.statusCode).toBe(200);
  });

  it("checks the Origin before the session: no Origin and no cookie is 403, not 401", async () => {
    const res = await call("POST", {});
    expect(res.statusCode).toBe(403);
    expect(res.json<ErrorJson>().error.code).toBe("FORBIDDEN");
  });

  it("answers 401 for a POST from a trusted Origin with no cookie", async () => {
    const res = await call("POST", { origin: config.dashboardOrigin });
    expect(res.statusCode).toBe(401);
  });

  it("answers 403 for a logged-in user POSTing from another Origin", async () => {
    const res = await call("POST", { cookie: await cookie(), origin: "https://evil.example" });
    expect(res.statusCode).toBe(403);
  });

  it("lets a logged-in user GET without an Origin", async () => {
    const res = await call("GET", { cookie: await cookie() });
    expect(res.statusCode).toBe(200);
  });
});
