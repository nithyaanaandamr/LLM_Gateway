import { accounts, createDb, type DbConnection, users } from "@gw/db";
import { createTestDatabase } from "@gw/db/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CLIENT_IP_HEADER } from "./client-ip-header.ts";
import { createAuth, type Auth } from "./create-auth.ts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// Better Auth's scrypt format: hex salt, colon, hex key
const SCRYPT_HASH_PATTERN = /^[0-9a-f]{32}:[0-9a-f]{128}$/;

const HTTP_BASE_URL = "http://localhost:8081";
const HTTPS_BASE_URL = "https://admin.example.com";
const DASHBOARD_ORIGIN = "http://localhost:5173";
const PASSWORD = "correct-horse-battery";

// The rate limit store is shared by every auth instance in this process, so each test uses its own IP
// see PITFALLS.md: Auth rate limit needs the real client IP
let nextIpSuffix = 1;
function uniqueIp(): string {
  return `10.0.0.${nextIpSuffix++}`;
}

interface PostOptions {
  ip?: string;
  origin?: string;
  cookie?: string;
}

function post(auth: Auth, baseURL: string, path: string, body: object, options: PostOptions = {}) {
  const headers = new Headers({ "content-type": "application/json" });
  headers.set(CLIENT_IP_HEADER, options.ip ?? uniqueIp());
  headers.set("origin", options.origin ?? DASHBOARD_ORIGIN);
  if (options.cookie) headers.set("cookie", options.cookie);
  return auth.handler(
    new Request(`${baseURL}/api/auth${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
  );
}

function signUp(auth: Auth, baseURL: string, email: string, options?: PostOptions) {
  return post(auth, baseURL, "/sign-up/email", { name: "Ada", email, password: PASSWORD }, options);
}

function signIn(
  auth: Auth,
  baseURL: string,
  email: string,
  password: string,
  options?: PostOptions,
) {
  return post(auth, baseURL, "/sign-in/email", { email, password }, options);
}

// "name=value" part of the first Set-Cookie, ready to send back as a Cookie header
function cookieFrom(response: Response): string {
  const setCookie = response.headers.getSetCookie()[0];
  if (!setCookie) throw new Error("response has no Set-Cookie");
  return setCookie.split(";")[0] ?? "";
}

describe("createAuth", () => {
  let connection: DbConnection;
  let auth: Auth;
  let httpsAuth: Auth;

  function authFor(baseURL: string): Auth {
    return createAuth({
      db: connection.db,
      secret: "test-secret-test-secret-test-secret-0123",
      baseURL,
      trustedOrigins: [baseURL, DASHBOARD_ORIGIN],
      log: () => {},
    });
  }

  beforeAll(async () => {
    connection = createDb(await createTestDatabase());
    auth = authFor(HTTP_BASE_URL);
    httpsAuth = authFor(HTTPS_BASE_URL);
  });

  afterAll(() => connection.close());

  it("stores users in auth.users with UUID ids", async () => {
    const context = await auth.$context;
    // 1.7 requires a provisioning source as the second argument
    const user = await context.internalAdapter.createUser(
      { name: "Ada", email: "uuid@example.com" },
      { method: "email-password" },
    );

    expect(user.id).toMatch(UUID_PATTERN);
    const rows = await connection.db.select().from(users).where(eq(users.id, user.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.email).toBe("uuid@example.com");
  });

  it("stores a scrypt hash, never the plain password", async () => {
    const response = await signUp(auth, HTTP_BASE_URL, "hash@example.com");
    expect(response.status).toBe(200);

    const [user] = await connection.db
      .select()
      .from(users)
      .where(eq(users.email, "hash@example.com"));
    const rows = await connection.db
      .select()
      .from(accounts)
      .where(eq(accounts.userId, user?.id ?? ""));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.providerId).toBe("credential");
    expect(rows[0]?.password).toMatch(SCRYPT_HASH_PATTERN);
    expect(rows[0]?.password).not.toContain(PASSWORD);
  });

  it("sets an HttpOnly, SameSite=Lax cookie, with no Secure on an http base URL", async () => {
    const response = await signUp(auth, HTTP_BASE_URL, "http-cookie@example.com");
    const setCookie = response.headers.getSetCookie()[0] ?? "";

    expect(setCookie).toMatch(/^better-auth\.session_token=/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(setCookie).not.toMatch(/Secure/i);
  });

  it("sets a __Secure- prefixed Secure cookie on an https base URL", async () => {
    const response = await signUp(httpsAuth, HTTPS_BASE_URL, "https-cookie@example.com");
    const setCookie = response.headers.getSetCookie()[0] ?? "";

    expect(setCookie).toMatch(/^__Secure-better-auth\.session_token=/);
    expect(setCookie).toMatch(/; Secure/i);
    expect(setCookie).toMatch(/HttpOnly/i);
  });

  it("rejects a sign-out with a hostile Origin, even under Vitest", async () => {
    const signedUp = await signUp(auth, HTTP_BASE_URL, "origin@example.com");
    const cookie = cookieFrom(signedUp);

    const hostile = await post(
      auth,
      HTTP_BASE_URL,
      "/sign-out",
      {},
      { cookie, origin: "https://evil.example" },
    );
    expect(hostile.status).toBe(403);

    const trusted = await post(auth, HTTP_BASE_URL, "/sign-out", {}, { cookie });
    expect(trusted.status).toBe(200);
  });

  describe("login rate limit", () => {
    it("answers the 4th sign-in from one IP with 429, but not a different IP", async () => {
      const ip = uniqueIp();
      const statuses: number[] = [];
      for (let attempt = 0; attempt < 4; attempt++) {
        const response = await signIn(auth, HTTP_BASE_URL, "nobody@example.com", PASSWORD, { ip });
        statuses.push(response.status);
      }
      expect(statuses).toEqual([401, 401, 401, 429]);

      const other = await signIn(auth, HTTP_BASE_URL, "nobody@example.com", PASSWORD, {
        ip: uniqueIp(),
      });
      expect(other.status).toBe(401);
    });
  });
});
