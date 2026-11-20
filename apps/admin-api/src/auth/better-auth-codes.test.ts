import { CLIENT_IP_HEADER } from "@gw/auth";
import { createDb, type DbConnection } from "@gw/db";
import Fastify from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Config } from "../config.ts";
import { TEST_PASSWORD, uniqueIp } from "../testing/auth-requests.ts";
import { testConfig } from "../testing/test-config.ts";
import { createAppAuth } from "./create-app-auth.ts";

// Pins the Better Auth error code strings that auth-error.ts maps. An upgrade that renames one
// fails here, not silently in production. Requests go straight to auth.handler, past our Zod checks.
describe("Better Auth error codes we map", () => {
  let config: Config;
  let connection: DbConnection;
  let handler: ReturnType<typeof createAppAuth>["handler"];

  beforeAll(async () => {
    config = await testConfig();
    connection = createDb(config.databaseUrl);
    const silent = Fastify({ logger: false });
    handler = createAppAuth(config, connection.db, silent.log).handler;
  });

  afterAll(() => connection.close());

  async function post(path: string, body: object) {
    const response = await handler(
      new Request(`${config.authBaseUrl}/api/auth${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: config.dashboardOrigin,
          [CLIENT_IP_HEADER]: uniqueIp(),
        },
        body: JSON.stringify(body),
      }),
    );
    return { status: response.status, body: (await response.json()) as { code?: string } };
  }

  const valid = { name: "Ada", email: "codes@example.com", password: TEST_PASSWORD };

  it("PASSWORD_TOO_SHORT for a 7-character password", async () => {
    const res = await post("/sign-up/email", {
      ...valid,
      email: "short@example.com",
      password: "p".repeat(7),
    });
    expect(res).toMatchObject({ status: 400, body: { code: "PASSWORD_TOO_SHORT" } });
  });

  it("PASSWORD_TOO_LONG for a 129-character password", async () => {
    const res = await post("/sign-up/email", {
      ...valid,
      email: "long@example.com",
      password: "p".repeat(129),
    });
    expect(res).toMatchObject({ status: 400, body: { code: "PASSWORD_TOO_LONG" } });
  });

  // Sign-up checks the email in its body schema first, so it answers VALIDATION_ERROR instead
  it("VALIDATION_ERROR for an invalid email on sign-up", async () => {
    const res = await post("/sign-up/email", { ...valid, email: "not-an-email" });
    expect(res).toMatchObject({ status: 400, body: { code: "VALIDATION_ERROR" } });
  });

  it("INVALID_EMAIL for an invalid email on sign-in", async () => {
    const res = await post("/sign-in/email", { email: "not-an-email", password: TEST_PASSWORD });
    expect(res).toMatchObject({ status: 400, body: { code: "INVALID_EMAIL" } });
  });

  it("USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL for a duplicate sign-up", async () => {
    await post("/sign-up/email", valid);
    const res = await post("/sign-up/email", valid);
    expect(res).toMatchObject({
      status: 422,
      body: { code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" },
    });
  });
});
