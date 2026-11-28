import { createDb, sessions, users, type DbConnection } from "@gw/db";
import { toDrizzle } from "@gw/db/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type App } from "../app.ts";
import type { Config } from "../config.ts";
import {
  cookieFrom,
  getSession,
  signIn,
  signOut,
  signUp,
  TEST_PASSWORD,
  uniqueIp,
} from "../testing/auth-requests.ts";
import { testConfig } from "../testing/test-config.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type ErrorJson = {
  error: { code: string; message: string; requestId: string; details?: { path: string }[] };
};

let emailCounter = 0;
function newEmail(): string {
  return `user${++emailCounter}@example.com`;
}

describe("auth routes", () => {
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

  function userRows(email: string) {
    return toDrizzle(connection.db).select().from(users).where(eq(users.email, email));
  }

  async function signedUp(): Promise<{ email: string; cookie: string }> {
    const email = newEmail();
    const res = await signUp(app, config, { name: "Ada", email, password: TEST_PASSWORD });
    expect(res.statusCode).toBe(200);
    return { email, cookie: cookieFrom(res) };
  }

  describe("sign-up", () => {
    it("creates the user, lower-cases the email, trims the name and sets a cookie", async () => {
      const res = await signUp(app, config, {
        name: "  Ada  ",
        email: "Ada.Mixed@Example.COM",
        password: TEST_PASSWORD,
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers["set-cookie"]).toBeDefined();
      expect(res.json<{ user: { email: string } }>().user.email).toBe("ada.mixed@example.com");
      const rows = await userRows("ada.mixed@example.com");
      expect(rows).toHaveLength(1);
      expect(rows[0]?.name).toBe("Ada");
    });

    it("answers 409 CONFLICT in our shape for the same email in another letter case", async () => {
      const email = newEmail();
      await signUp(app, config, { name: "Ada", email, password: TEST_PASSWORD });

      const res = await signUp(app, config, {
        name: "Ada",
        email: email.toUpperCase(),
        password: TEST_PASSWORD,
      });

      expect(res.statusCode).toBe(409);
      const { error } = res.json<ErrorJson>();
      expect(error.code).toBe("CONFLICT");
      expect(error.requestId).toMatch(UUID);
      expect(await userRows(email)).toHaveLength(1);
    });

    // The password length rules live in Better Auth (createAuth); these pin both edges
    it.each([
      [7, 400],
      [8, 200],
      [128, 200],
      [129, 400],
    ])("a password of %i characters gives %i", async (length, status) => {
      const res = await signUp(app, config, {
        name: "Ada",
        email: newEmail(),
        password: "p".repeat(length),
      });
      expect(res.statusCode).toBe(status);
      if (status === 400) expect(res.json<ErrorJson>().error.code).toBe("VALIDATION_FAILED");
    });
  });

  describe("body validation", () => {
    const valid = { name: "Ada", email: "valid@example.com", password: TEST_PASSWORD };

    it.each([
      ["a missing email", { ...valid, email: undefined }, "body.email"],
      ["a wrong-type email", { ...valid, email: 123 }, "body.email"],
      ["an invalid email", { ...valid, email: "not-an-email" }, "body.email"],
      ["a missing name", { ...valid, name: undefined }, "body.name"],
      ["a blank name", { ...valid, name: "   " }, "body.name"],
      ["a name over 100 characters", { ...valid, name: "n".repeat(101) }, "body.name"],
      ["a wrong-type password", { ...valid, password: 12345678 }, "body.password"],
    ])("sign-up with %s gives 400 VALIDATION_FAILED with details", async (_name, body, path) => {
      const res = await signUp(app, config, body);

      expect(res.statusCode).toBe(400);
      const { error } = res.json<ErrorJson>();
      expect(error.code).toBe("VALIDATION_FAILED");
      expect(error.details?.map((d) => d.path)).toContain(path);
    });

    it("sign-in with a missing or invalid email gives 400 VALIDATION_FAILED with details", async () => {
      for (const email of [undefined, "not-an-email", 42]) {
        const res = await signIn(app, config, { email, password: TEST_PASSWORD });
        expect(res.statusCode).toBe(400);
        const { error } = res.json<ErrorJson>();
        expect(error.code).toBe("VALIDATION_FAILED");
        expect(error.details?.map((d) => d.path)).toContain("body.email");
      }
    });

    it("accepts an email of 254 characters and rejects one of 255", async () => {
      const emailOfLength = (length: number) => `${"a".repeat(length - 12)}@example.com`;

      const ok = await signUp(app, config, { ...valid, email: emailOfLength(254) });
      const tooLong = await signUp(app, config, { ...valid, email: emailOfLength(255) });

      expect(ok.statusCode).toBe(200);
      expect(tooLong.statusCode).toBe(400);
      expect(tooLong.json<ErrorJson>().error.details?.map((d) => d.path)).toContain("body.email");
    });

    it("rejects unknown keys on sign-up and sign-in", async () => {
      const up = await signUp(app, config, {
        ...valid,
        email: newEmail(),
        image: "http://x/y.png",
      });
      expect(up.statusCode).toBe(400);
      expect(up.json<ErrorJson>().error.code).toBe("VALIDATION_FAILED");

      const inn = await signIn(app, config, {
        email: valid.email,
        password: TEST_PASSWORD,
        callbackURL: "http://evil.example",
      });
      expect(inn.statusCode).toBe(400);
      expect(inn.json<ErrorJson>().error.code).toBe("VALIDATION_FAILED");
    });
  });

  describe("sign-in", () => {
    it("logs in with the right password and sets a cookie", async () => {
      const { email } = await signedUp();

      const res = await signIn(app, config, { email, password: TEST_PASSWORD });

      expect(res.statusCode).toBe(200);
      expect(res.headers["set-cookie"]).toBeDefined();
      expect(res.json<{ user: { email: string } }>().user.email).toBe(email);
    });

    it("answers the same 401 for a wrong password and for an unknown email", async () => {
      const { email } = await signedUp();

      const wrongPassword = await signIn(app, config, { email, password: "wrong-password" });
      const unknownEmail = await signIn(app, config, {
        email: newEmail(),
        password: "wrong-password",
      });

      for (const res of [wrongPassword, unknownEmail]) {
        expect(res.statusCode).toBe(401);
        expect(res.json<ErrorJson>().error.code).toBe("UNAUTHORIZED");
      }
      expect(wrongPassword.json<ErrorJson>().error.message).toBe(
        unknownEmail.json<ErrorJson>().error.message,
      );
    });

    it("answers 429 RATE_LIMITED on the 4th sign-in from one IP, but not for another IP", async () => {
      const remoteAddress = uniqueIp();
      const attempt = (address: string) =>
        signIn(
          app,
          config,
          { email: newEmail(), password: "wrong-password" },
          { remoteAddress: address },
        );

      const statuses = [];
      for (let i = 0; i < 4; i++) statuses.push((await attempt(remoteAddress)).statusCode);

      expect(statuses).toEqual([401, 401, 401, 429]);
      expect((await attempt(uniqueIp())).statusCode).toBe(401);
    });

    it("sends a numeric Retry-After header with the 429", async () => {
      const remoteAddress = uniqueIp();
      const attempt = () =>
        signIn(app, config, { email: newEmail(), password: "wrong-password" }, { remoteAddress });
      for (let i = 0; i < 3; i++) await attempt();

      const limited = await attempt();

      expect(limited.statusCode).toBe(429);
      expect(limited.headers["retry-after"]).toMatch(/^\d+$/);
      expect(limited.json<ErrorJson>().error.code).toBe("RATE_LIMITED");
    });

    it("ignores a client-sent x-gw-client-ip header when counting attempts", async () => {
      const remoteAddress = uniqueIp();
      const statuses = [];
      for (const spoofed of ["9.9.9.1", "9.9.9.2", "9.9.9.3", "9.9.9.4"]) {
        const res = await signIn(
          app,
          config,
          { email: newEmail(), password: "wrong-password" },
          { remoteAddress, headers: { "x-gw-client-ip": spoofed } },
        );
        statuses.push(res.statusCode);
      }
      expect(statuses).toEqual([401, 401, 401, 429]);
    });
  });

  describe("get-session", () => {
    it("returns the user for a cookie and null without one", async () => {
      const { email, cookie } = await signedUp();

      const withCookie = await getSession(app, config, { cookie });
      expect(withCookie.statusCode).toBe(200);
      expect(withCookie.json<{ user: { email: string } }>().user.email).toBe(email);

      const without = await getSession(app, config);
      expect(without.statusCode).toBe(200);
      expect(without.json()).toBeNull();
    });
  });

  describe("get-session query", () => {
    it("rejects unknown query parameters", async () => {
      const res = await app.inject({ method: "GET", url: "/api/auth/get-session?x=1" });
      expect(res.statusCode).toBe(400);
      expect(res.json<ErrorJson>().error.code).toBe("VALIDATION_FAILED");
    });
  });

  describe("sign-out", () => {
    it("clears the cookie and deletes the session row", async () => {
      const { email, cookie } = await signedUp();
      const [user] = await userRows(email);
      expect(
        await toDrizzle(connection.db)
          .select()
          .from(sessions)
          .where(eq(sessions.userId, user?.id ?? "")),
      ).toHaveLength(1);

      const res = await signOut(app, config, { cookie });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ success: true });
      expect(String(res.headers["set-cookie"])).toMatch(/Max-Age=0/i);
      expect(
        await toDrizzle(connection.db)
          .select()
          .from(sessions)
          .where(eq(sessions.userId, user?.id ?? "")),
      ).toHaveLength(0);
      expect((await getSession(app, config, { cookie })).json()).toBeNull();
    });

    it("works with no body at all and with a JSON null body", async () => {
      for (const payload of [undefined, "null"]) {
        const { cookie } = await signedUp();
        const res = await app.inject({
          method: "POST",
          url: "/api/auth/sign-out",
          remoteAddress: uniqueIp(),
          headers: {
            origin: config.dashboardOrigin,
            cookie,
            ...(payload === undefined ? {} : { "content-type": "application/json" }),
          },
          ...(payload === undefined ? {} : { payload }),
        });
        expect(res.statusCode).toBe(200);
        expect((await getSession(app, config, { cookie })).json()).toBeNull();
      }
    });

    it("rejects a body with unknown keys", async () => {
      const { cookie } = await signedUp();
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/sign-out",
        remoteAddress: uniqueIp(),
        headers: { origin: config.dashboardOrigin, cookie },
        payload: { a: 1 },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json<ErrorJson>().error.code).toBe("VALIDATION_FAILED");
    });

    it("answers 403 FORBIDDEN in our shape with no Origin or a hostile Origin", async () => {
      const { cookie } = await signedUp();

      for (const origin of [null, "https://evil.example"]) {
        const res = await signOut(app, config, { cookie, origin });
        expect(res.statusCode).toBe(403);
        const { error } = res.json<ErrorJson>();
        expect(error.code).toBe("FORBIDDEN");
        expect(error.requestId).toMatch(UUID);
      }
      // the session survived both attempts
      expect((await getSession(app, config, { cookie })).json()).not.toBeNull();
    });
  });

  describe("endpoints we do not expose", () => {
    it.each(["/api/auth/update-user", "/api/auth/sign-in/social", "/api/auth/change-password"])(
      "POST %s gives 404 NOT_FOUND",
      async (url) => {
        const res = await app.inject({ method: "POST", url, payload: {} });
        expect(res.statusCode).toBe(404);
        expect(res.json<ErrorJson>().error.code).toBe("NOT_FOUND");
      },
    );

    it("GET /api/auth/list-sessions gives 404 NOT_FOUND", async () => {
      const res = await app.inject("/api/auth/list-sessions");
      expect(res.statusCode).toBe(404);
      expect(res.json<ErrorJson>().error.code).toBe("NOT_FOUND");
    });
  });
});

describe("auth routes on an https base URL", () => {
  let config: Config;
  let app: App;

  beforeAll(async () => {
    config = await testConfig({ authBaseUrl: "https://admin.example.com" });
    app = buildApp(config);
  });

  afterAll(() => app.close());

  it("sets a __Secure- prefixed, Secure, HttpOnly session cookie", async () => {
    const res = await signUp(app, config, {
      name: "Ada",
      email: "https@example.com",
      password: TEST_PASSWORD,
    });

    const cookies = [res.headers["set-cookie"]].flat().map(String);
    const session = cookies.find((value) =>
      value.startsWith("__Secure-better-auth.session_token="),
    );
    expect(session).toMatch(/; Secure/i);
    expect(session).toMatch(/HttpOnly/i);
    expect(session).toMatch(/SameSite=Lax/i);
  });
});
