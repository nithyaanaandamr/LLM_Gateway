import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type App } from "./app.ts";
import type { Config } from "./config.ts";
import {
  cookieFrom,
  getSession,
  signIn,
  signOut,
  signUp,
  TEST_PASSWORD,
} from "./testing/auth-requests.ts";
import { testConfig } from "./testing/test-config.ts";

const EMAIL = "nostore@example.com";

describe("Cache-Control: no-store", () => {
  let config: Config;
  let app: App;
  let cookie: string;

  beforeAll(async () => {
    config = await testConfig();
    app = buildApp(config);
    // Route that throws, to reach the error handler with a 5xx
    app.get("/boom", () => {
      throw new Error("boom");
    });
    const res = await signUp(app, config, {
      name: "No Store",
      email: EMAIL,
      password: TEST_PASSWORD,
    });
    cookie = cookieFrom(res);
  });

  afterAll(async () => {
    await app.close();
  });

  it("is set on GET /api/me, logged in (200)", async () => {
    const res = await app.inject({ url: "/api/me", headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("is set on GET /api/me with no cookie (401)", async () => {
    const res = await app.inject("/api/me");
    expect(res.statusCode).toBe(401);
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("is set on the sign-out 403 for a missing Origin", async () => {
    const res = await signOut(app, config, { origin: null, cookie });
    expect(res.statusCode).toBe(403);
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("is set on get-session", async () => {
    const res = await getSession(app, config, { cookie });
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("is set on sign-in (200)", async () => {
    const res = await signIn(app, config, { email: EMAIL, password: TEST_PASSWORD });
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("is set on the 404 from the not-found handler", async () => {
    const res = await app.inject("/nope");
    expect(res.statusCode).toBe(404);
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("is set on a 500 from the error handler", async () => {
    const res = await app.inject("/boom");
    expect(res.statusCode).toBe(500);
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("is set on an error Fastify raises before routing (invalid URL)", async () => {
    const res = await app.inject("/%");
    expect(res.statusCode).toBe(400);
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("is set on /health", async () => {
    const res = await app.inject("/health");
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
  });
});
