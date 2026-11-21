// Phase 1 end to end: the real admin API process, driven over HTTP, then read the way the gateway will.
// see PITFALLS.md: E2E reads the database like the gateway
import { randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createDb, schema, type DbConnection } from "@gw/db";
import { toDrizzle } from "@gw/db/testing";
import { decryptProviderKey, hashGatewayKey } from "@gw/shared/crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Config } from "../config.ts";
import { COOKIE_WITH_VALUE, forms, request, sessionCookieOf } from "../testing/fetch-requests.ts";
import { killAllServers, logLines, startListening, stopServer } from "../testing/server-process.ts";
import { testConfig } from "../testing/test-config.ts";
import { testEnv } from "../testing/test-env.ts";

const MAIN = fileURLToPath(new URL("../main.ts", import.meta.url));
const PASSWORD = "correct-horse-battery";

type GatewayKeyJson = { id: string; keyPrefix: string; revokedAt: string | null };

describe("Phase 1 end to end (real process, real HTTP)", { timeout: 60_000 }, () => {
  let config: Config;
  let env: Record<string, string>;
  let connection: DbConnection;

  beforeAll(async () => {
    config = await testConfig();
    env = testEnv(config);
    connection = createDb(config.databaseUrl);
  });

  afterAll(() => connection.close());
  afterEach(killAllServers);

  const send = (url: string, method: string, body?: unknown, cookie?: string) =>
    request(url, { method, origin: env["DASHBOARD_ORIGIN"] ?? "", body, cookie });

  // The gateway's read path: only the key in hand, straight from the database
  async function gatewayLookup(key: string) {
    const [keyRow] = await toDrizzle(connection.db)
      .select()
      .from(schema.gatewayKeys)
      .where(eq(schema.gatewayKeys.keyHash, hashGatewayKey(key)));
    const providerRows = keyRow
      ? await toDrizzle(connection.db)
          .select()
          .from(schema.providerKeys)
          .where(eq(schema.providerKeys.projectId, keyRow.projectId))
      : [];
    return { keyRow, providerRows };
  }

  it("sign up, project, provider key, gateway key, gateway read, revoke, delete, clean logs", async () => {
    const canary = "sk-test-" + randomBytes(16).toString("hex");
    const email = `${randomUUID()}@example.com`;
    const server = await startListening(MAIN, env);

    // 1. Sign up, then the session works
    const signUp = await send(`${server.url}/api/auth/sign-up/email`, "POST", {
      name: "E2E User",
      email,
      password: PASSWORD,
    });
    expect(signUp.status).toBe(200);
    const { token } = (await signUp.json()) as { token: string };
    const cookie = sessionCookieOf(signUp);
    expect((await send(`${server.url}/api/me`, "GET", undefined, cookie)).status).toBe(200);

    // 2. Project
    const created = await send(`${server.url}/api/projects`, "POST", { name: "E2E" }, cookie);
    expect(created.status).toBe(201);
    const { id: projectId } = (await created.json()) as { id: string };
    const projectUrl = `${server.url}/api/projects/${projectId}`;

    // 3. Provider key
    const stored = await send(
      `${projectUrl}/provider-key`,
      "PUT",
      { provider: "openai", key: canary },
      cookie,
    );
    expect(stored.status).toBe(200);
    expect(await stored.json()).toMatchObject({ lastFour: canary.slice(-4) });

    // 4. Gateway key
    const issued = await send(`${projectUrl}/gateway-keys`, "POST", { name: "ci" }, cookie);
    expect(issued.status).toBe(201);
    const { key, gatewayKey } = (await issued.json()) as {
      key: string;
      gatewayKey: GatewayKeyJson;
    };
    const hexPart = key.slice("gw_live_".length);
    expect(key).toMatch(/^gw_live_[0-9a-f]{64}$/);

    // 5. Reads show the prefix and last four only
    const listed = await send(`${projectUrl}/gateway-keys`, "GET", undefined, cookie);
    const listedText = await listed.text();
    expect(listed.status).toBe(200);
    expect(JSON.parse(listedText)).toMatchObject({
      gatewayKeys: [{ id: gatewayKey.id, keyPrefix: key.slice(0, 12) }],
    });
    expect(listedText).not.toContain(hexPart);
    const providerRead = await send(`${projectUrl}/provider-key`, "GET", undefined, cookie);
    const providerText = await providerRead.text();
    expect(providerRead.status).toBe(200);
    expect(JSON.parse(providerText)).toMatchObject({ lastFour: canary.slice(-4) });
    expect(providerText).not.toContain(canary);

    // 6. Gateway contract: hash lookup, then decrypt
    const { keyRow, providerRows } = await gatewayLookup(key);
    expect(keyRow?.projectId).toBe(projectId);
    expect(keyRow?.revokedAt).toBeNull();
    expect(providerRows).toHaveLength(1);
    const decrypted = decryptProviderKey({
      encrypted: providerRows[0]!,
      projectId: keyRow!.projectId,
      masterKeys: [config.masterKey],
    });
    expect(decrypted).toBe(canary);

    // 7. Revoke
    const revoked = await send(
      `${projectUrl}/gateway-keys/${gatewayKey.id}`,
      "DELETE",
      undefined,
      cookie,
    );
    expect(revoked.status).toBe(204);
    expect((await gatewayLookup(key)).keyRow?.revokedAt).toBeInstanceOf(Date);

    // 8. Delete the project: both key rows go
    const removed = await send(projectUrl, "DELETE", undefined, cookie);
    expect(removed.status).toBe(204);
    const after = await gatewayLookup(key);
    expect(after.keyRow).toBeUndefined();
    const leftover = await toDrizzle(connection.db)
      .select()
      .from(schema.providerKeys)
      .where(eq(schema.providerKeys.projectId, projectId));
    expect(leftover).toEqual([]);

    // 9. Clean shutdown; no secret in the logs
    expect(await stopServer(server)).toBe(0);
    const output = server.out() + server.err();
    expect(output).toContain(projectId); // requests were logged, so this is not vacuous
    const secrets = [
      canary,
      key,
      hexPart,
      PASSWORD,
      token,
      ...forms(cookie.split("=")[1] ?? ""),
      env["MASTER_KEY"] ?? "",
      env["BETTER_AUTH_SECRET"] ?? "",
    ];
    for (const secret of secrets) {
      expect(secret).not.toBe("");
      expect(output).not.toContain(secret);
    }
    expect(output).not.toMatch(COOKIE_WITH_VALUE);
    expect(server.err()).toBe("");
    expect(logLines(server.out()).length).toBeGreaterThan(0);
  });
});
