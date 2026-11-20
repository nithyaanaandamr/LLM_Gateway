import { CLIENT_IP_HEADER, createAuth } from "@gw/auth";
import { createDb, type DbConnection } from "@gw/db";
import Fastify, { type FastifyInstance, type InjectOptions } from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Config } from "../config.ts";
import { testConfig } from "../testing/test-config.ts";
import { sendWebResponse } from "./send-web-response.ts";
import { toWebRequest } from "./to-web-request.ts";
import { trustedOrigins } from "./trusted-origins.ts";

const BASE_URL = "http://localhost:8081";

interface Seen {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
}

// A real Fastify app whose catch-all route reports what toWebRequest built
function appThatEchoes(): FastifyInstance {
  const app = Fastify();
  app.all("*", async (request) => {
    const webRequest = toWebRequest(request, BASE_URL);
    const seen: Seen = {
      url: webRequest.url,
      method: webRequest.method,
      headers: Object.fromEntries(webRequest.headers),
      body: webRequest.body === null ? null : await webRequest.text(),
    };
    return seen;
  });
  return app;
}

describe("toWebRequest", () => {
  let app: FastifyInstance;
  afterEach(() => app.close());

  async function seenFor(options: InjectOptions): Promise<Seen> {
    app = appThatEchoes();
    return (await app.inject(options)).json<Seen>();
  }

  it("builds the URL from the configured origin and keeps path and query", async () => {
    const seen = await seenFor({
      method: "GET",
      url: "/api/auth/get-session?disableCookieCache=true",
    });
    expect(seen.url).toBe(`${BASE_URL}/api/auth/get-session?disableCookieCache=true`);
  });

  it("ignores the Host header", async () => {
    const seen = await seenFor({
      method: "GET",
      url: "/api/me",
      headers: { host: "evil.example" },
    });
    expect(new URL(seen.url).host).toBe("localhost:8081");
  });

  it("keeps the configured host for a path that starts with two slashes", async () => {
    const seen = await seenFor({ method: "GET", url: "//evil.example/x" });
    expect(new URL(seen.url).host).toBe("localhost:8081");
  });

  it("replaces a client-sent client IP header with the connection IP", async () => {
    const seen = await seenFor({
      method: "GET",
      url: "/x",
      remoteAddress: "10.9.8.7",
      headers: { [CLIENT_IP_HEADER]: "1.2.3.4" },
    });
    expect(seen.headers[CLIENT_IP_HEADER]).toBe("10.9.8.7");
  });

  it("sets the client IP header when the client sent none", async () => {
    const seen = await seenFor({ method: "GET", url: "/x", remoteAddress: "10.9.8.6" });
    expect(seen.headers[CLIENT_IP_HEADER]).toBe("10.9.8.6");
  });

  it("copies other headers, such as the cookie", async () => {
    const seen = await seenFor({
      method: "GET",
      url: "/x",
      headers: { cookie: "a=b", origin: "http://x" },
    });
    expect(seen.headers).toMatchObject({ cookie: "a=b", origin: "http://x" });
  });

  it("re-serializes the parsed JSON body and drops the client content-length", async () => {
    const seen = await seenFor({
      method: "POST",
      url: "/api/auth/sign-in/email",
      payload: { email: "ada@example.com", password: "p" },
    });
    expect(seen.method).toBe("POST");
    expect(JSON.parse(seen.body ?? "null")).toEqual({ email: "ada@example.com", password: "p" });
    expect(seen.headers["content-length"]).toBeUndefined();
    expect(seen.headers["content-type"]).toMatch(/^application\/json/);
  });

  it("gives a GET no body", async () => {
    const seen = await seenFor({ method: "GET", url: "/x" });
    expect(seen.body).toBeNull();
  });
});

// With the real auth instance: the rate limit must follow the connection IP, not what the client claims
describe("toWebRequest with createAuth", () => {
  let config: Config;
  let connection: DbConnection;
  let app: FastifyInstance;

  beforeAll(async () => {
    config = await testConfig();
    connection = createDb(config.databaseUrl);
    const auth = createAuth({
      db: connection.db,
      secret: config.authSecret,
      baseURL: config.authBaseUrl,
      trustedOrigins: trustedOrigins(config),
      log: () => {},
    });
    app = Fastify();
    app.post("/api/auth/sign-in/email", async (request, reply) => {
      const response = await auth.handler(toWebRequest(request, config.authBaseUrl));
      return sendWebResponse(reply, response);
    });
  });

  afterAll(async () => {
    await app.close();
    await connection.close();
  });

  function signIn(remoteAddress: string, claimedIp: string) {
    return app.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      remoteAddress,
      headers: { origin: config.dashboardOrigin, [CLIENT_IP_HEADER]: claimedIp },
      payload: { email: "nobody@example.com", password: "wrong-password" },
    });
  }

  it("shares one rate-limit bucket per connection IP, whatever IP the client claims", async () => {
    const statuses: number[] = [];
    for (const claimed of ["1.1.1.1", "2.2.2.2", "3.3.3.3", "4.4.4.4"]) {
      statuses.push((await signIn("10.1.0.1", claimed)).statusCode);
    }
    expect(statuses).toEqual([401, 401, 401, 429]);
  });

  it("gives a different connection IP its own bucket", async () => {
    for (const claimed of ["1.1.1.1", "1.1.1.1", "1.1.1.1"]) await signIn("10.1.0.2", claimed);
    expect((await signIn("10.1.0.3", "1.1.1.1")).statusCode).toBe(401);
  });
});
