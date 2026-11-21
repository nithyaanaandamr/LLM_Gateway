import { randomBytes, randomUUID } from "node:crypto";
import { createDb, schema, type DbConnection } from "@gw/db";
import { decryptProviderKey } from "@gw/shared/crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type App } from "../app.ts";
import type { Config } from "../config.ts";
import { apiRequest } from "../testing/api-requests.ts";
import { signUpUser } from "../testing/auth-requests.ts";
import { createProject } from "../testing/project-requests.ts";
import { testConfig } from "../testing/test-config.ts";

type ErrorJson = { error: { code: string; message: string } };
type ProviderKeyJson = { provider: string; lastFour: string; createdAt: string; updatedAt: string };

const keyOf = (length: number) =>
  "sk-" +
  randomBytes(length)
    .toString("hex")
    .slice(0, length - 3);
const realKey = () => keyOf(40);

describe("provider key routes", () => {
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

  const urlFor = (projectId: string) => `/api/projects/${projectId}/provider-key`;

  const put = (
    cookie: string,
    projectId: string,
    payload: unknown,
    extra: { origin?: string | null } = {},
  ) =>
    apiRequest(app, config, { method: "PUT", url: urlFor(projectId), cookie, payload, ...extra });

  const get = (cookie: string, projectId: string) =>
    apiRequest(app, config, { method: "GET", url: urlFor(projectId), cookie });

  const remove = (cookie: string, projectId: string) =>
    apiRequest(app, config, { method: "DELETE", url: urlFor(projectId), cookie });

  const rowsOf = (projectId: string) =>
    connection.db
      .select()
      .from(schema.providerKeys)
      .where(eq(schema.providerKeys.projectId, projectId));

  // A signed-up user with one project
  async function setup() {
    const { cookie } = await signUpUser(app, config);
    const project = await createProject(app, config, cookie);
    return { cookie, projectId: project.id };
  }

  function decrypted(row: Awaited<ReturnType<typeof rowsOf>>[number], projectId: string): string {
    return decryptProviderKey({
      encrypted: row,
      projectId,
      masterKeys: [config.masterKey],
    });
  }

  describe("PUT", () => {
    it("answers 200 with exactly provider, lastFour and the dates, never the key", async () => {
      const { cookie, projectId } = await setup();
      const key = realKey();

      const res = await put(cookie, projectId, { provider: "openai", key });

      expect(res.statusCode).toBe(200);
      expect(Object.keys(res.json<ProviderKeyJson>()).sort()).toEqual([
        "createdAt",
        "lastFour",
        "provider",
        "updatedAt",
      ]);
      expect(res.json<ProviderKeyJson>()).toMatchObject({
        provider: "openai",
        lastFour: key.slice(-4),
      });
      expect(res.body).not.toContain(key);
      expect(res.headers["cache-control"]).toBe("no-store");
    });

    it("stores encrypted bytes that decrypt with the project ID", async () => {
      const { cookie, projectId } = await setup();
      const key = realKey();

      await put(cookie, projectId, { provider: "openai", key });

      const [row, ...others] = await rowsOf(projectId);
      expect(others).toHaveLength(0);
      expect(row!.ciphertext.includes(Buffer.from(key))).toBe(false);
      expect(row!.nonce).toHaveLength(12);
      expect(row!.authTag).toHaveLength(16);
      expect(row!.masterKeyVersion).toBe(1);
      expect(decrypted(row!, projectId)).toBe(key);
    });

    it("replaces in place: one row, decrypts to the new key, new lastFour", async () => {
      const { cookie, projectId } = await setup();
      const [first, second] = [realKey(), realKey()];
      await put(cookie, projectId, { provider: "openai", key: first });
      const [before] = await rowsOf(projectId);

      const res = await put(cookie, projectId, { provider: "openai", key: second });

      expect(res.statusCode).toBe(200);
      expect(res.json<ProviderKeyJson>().lastFour).toBe(second.slice(-4));
      const rows = await rowsOf(projectId);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.id).toBe(before!.id);
      expect(rows[0]!.createdAt).toEqual(before!.createdAt);
      expect(decrypted(rows[0]!, projectId)).toBe(second);
    });

    it("uses the lowercase project ID for the AAD when the URL is uppercase", async () => {
      const { cookie, projectId } = await setup();
      const key = realKey();

      const res = await put(cookie, projectId.toUpperCase(), { provider: "openai", key });

      expect(res.statusCode).toBe(200);
      const [row] = await rowsOf(projectId);
      expect(decrypted(row!, projectId)).toBe(key);
    });

    it("stores a trimmed key: spaces and a trailing newline are removed", async () => {
      const { cookie, projectId } = await setup();
      const key = realKey();

      const res = await put(cookie, projectId, { provider: "openai", key: `  ${key}\n` });

      expect(res.statusCode).toBe(200);
      expect(res.json<ProviderKeyJson>().lastFour).toBe(key.slice(-4));
      const [row] = await rowsOf(projectId);
      expect(decrypted(row!, projectId)).toBe(key);
    });

    it("accepts a space inside the key: there is no format check", async () => {
      const { cookie, projectId } = await setup();
      const key = "my provider key with spaces 123";

      const res = await put(cookie, projectId, { provider: "openai", key });

      expect(res.statusCode).toBe(200);
      const [row] = await rowsOf(projectId);
      expect(decrypted(row!, projectId)).toBe(key);
    });

    it.each([20, 512])("accepts a key of exactly %i characters", async (length) => {
      const { cookie, projectId } = await setup();
      const key = "k".repeat(length);

      const res = await put(cookie, projectId, { provider: "openai", key });

      expect(res.statusCode).toBe(200);
      const [row] = await rowsOf(projectId);
      expect(decrypted(row!, projectId)).toBe(key);
    });

    it("takes lastFour in whole characters, not code units", async () => {
      const { cookie, projectId } = await setup();
      const key = "k".repeat(30) + "ab\u{1F600}\u{1F601}";

      const res = await put(cookie, projectId, { provider: "openai", key });

      expect(res.json<ProviderKeyJson>().lastFour).toBe("ab\u{1F600}\u{1F601}");
    });

    describe("answers 400 VALIDATION_FAILED and never repeats the value", () => {
      // [name, body]; every secret-like value contains SECRET so one check covers all
      const secret = "SECRET" + "x".repeat(20);
      const cases: [string, unknown][] = [
        ["a missing key", { provider: "openai" }],
        ["an empty key", { provider: "openai", key: "" }],
        ["a whitespace-only key", { provider: "openai", key: " ".repeat(30) }],
        ["a key of 19 characters", { provider: "openai", key: (secret + "x").slice(0, 19) }],
        ["a key of 513 characters", { provider: "openai", key: secret + "x".repeat(513) }],
        [
          "a key of 513 characters after trimming",
          { provider: "openai", key: ` ${secret}${"x".repeat(513 - secret.length)} ` },
        ],
        [
          "a gateway key",
          { provider: "openai", key: `gw_live_${randomBytes(32).toString("hex")}` },
        ],
        ["a gateway key with spaces around", { provider: "openai", key: ` gw_live_${secret} ` }],
        ["a key that is not a string", { provider: "openai", key: 1234567890123456 }],
        ["an unknown provider", { provider: "anthropic", key: secret }],
        ["a missing provider", { key: secret }],
        ["an extra field", { provider: "openai", key: secret + "1", projectId: randomUUID() }],
        ["a lone surrogate", { provider: "openai", key: "k".repeat(30) + "\ud800" }],
        [
          "a NUL in the last four characters",
          { provider: "openai", key: "k".repeat(30) + "ab\u0000d" },
        ],
        [
          "a NUL in the middle",
          { provider: "openai", key: "k".repeat(15) + "\u0000" + "k".repeat(15) },
        ],
        [
          "a tab in the middle",
          { provider: "openai", key: "k".repeat(15) + "\t" + "k".repeat(15) },
        ],
        [
          "a newline in the middle",
          { provider: "openai", key: "k".repeat(15) + "\n" + "k".repeat(15) },
        ],
        ["a body that is not an object", [secret]],
      ];

      it.each(cases)("%s", async (_name, payload) => {
        const { cookie, projectId } = await setup();

        const res = await put(cookie, projectId, payload);

        expect(res.statusCode).toBe(400);
        expect(res.json<ErrorJson>().error.code).toBe("VALIDATION_FAILED");
        expect(res.body).not.toContain("SECRET");
        expect(res.body).not.toContain("gw_live_");
        expect(res.body).not.toContain("kkkkkkkk");
        expect(await rowsOf(projectId)).toHaveLength(0);
      });

      it("tells the user a gateway key is the wrong key", async () => {
        const { cookie, projectId } = await setup();

        const res = await put(cookie, projectId, { provider: "openai", key: `gw_live_${secret}` });

        expect(res.body).toContain("This is a gateway key. Paste your provider's API key instead.");
      });
    });

    it("answers 403 without an Origin and stores nothing", async () => {
      const { cookie, projectId } = await setup();

      const res = await put(
        cookie,
        projectId,
        { provider: "openai", key: realKey() },
        { origin: null },
      );

      expect(res.statusCode).toBe(403);
      expect(await rowsOf(projectId)).toHaveLength(0);
    });

    it("answers 404 for another user's project and writes no row", async () => {
      const [owner, intruder] = [await signUpUser(app, config), await signUpUser(app, config)];
      const project = await createProject(app, config, owner.cookie);

      const res = await put(intruder.cookie, project.id, { provider: "openai", key: realKey() });

      expect(res.statusCode).toBe(404);
      expect(res.json<ErrorJson>().error.message).toBe("Project not found");
      expect(await rowsOf(project.id)).toHaveLength(0);
    });
  });

  describe("GET", () => {
    it("returns the summary after a PUT", async () => {
      const { cookie, projectId } = await setup();
      const key = realKey();
      const stored = await put(cookie, projectId, { provider: "openai", key });

      const res = await get(cookie, projectId);

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(stored.json());
      expect(res.body).not.toContain(key);
      expect(res.headers["cache-control"]).toBe("no-store");
    });

    it("answers 404 'No provider key set' when none is stored", async () => {
      const { cookie, projectId } = await setup();

      const res = await get(cookie, projectId);

      expect(res.statusCode).toBe(404);
      expect(res.json<ErrorJson>().error).toMatchObject({
        code: "NOT_FOUND",
        message: "No provider key set",
      });
    });

    it("answers 404 'Project not found' for another user's project", async () => {
      const [owner, intruder] = [await signUpUser(app, config), await signUpUser(app, config)];
      const project = await createProject(app, config, owner.cookie);
      await put(owner.cookie, project.id, { provider: "openai", key: realKey() });

      const res = await get(intruder.cookie, project.id);

      expect(res.statusCode).toBe(404);
      expect(res.json<ErrorJson>().error.message).toBe("Project not found");
    });
  });

  describe("DELETE", () => {
    it("removes the key: 204, then GET is 404, then DELETE is 404", async () => {
      const { cookie, projectId } = await setup();
      await put(cookie, projectId, { provider: "openai", key: realKey() });

      const first = await remove(cookie, projectId);
      expect(first.statusCode).toBe(204);
      expect(first.body).toBe("");
      expect((await get(cookie, projectId)).statusCode).toBe(404);
      const again = await remove(cookie, projectId);
      expect(again.statusCode).toBe(404);
      expect(again.json<ErrorJson>().error.message).toBe("No provider key set");
      expect(await rowsOf(projectId)).toHaveLength(0);
    });

    it("answers 403 without an Origin and keeps the key", async () => {
      const { cookie, projectId } = await setup();
      await put(cookie, projectId, { provider: "openai", key: realKey() });

      const res = await apiRequest(app, config, {
        method: "DELETE",
        url: urlFor(projectId),
        cookie,
        origin: null,
      });

      expect(res.statusCode).toBe(403);
      expect(await rowsOf(projectId)).toHaveLength(1);
    });

    it("answers 404 for another user's project and keeps the key", async () => {
      const [owner, intruder] = [await signUpUser(app, config), await signUpUser(app, config)];
      const project = await createProject(app, config, owner.cookie);
      await put(owner.cookie, project.id, { provider: "openai", key: realKey() });

      const res = await remove(intruder.cookie, project.id);

      expect(res.statusCode).toBe(404);
      expect(await rowsOf(project.id)).toHaveLength(1);
    });
  });

  it("removes the provider key row when the project is deleted", async () => {
    const { cookie, projectId } = await setup();
    await put(cookie, projectId, { provider: "openai", key: realKey() });

    const res = await apiRequest(app, config, {
      method: "DELETE",
      url: `/api/projects/${projectId}`,
      cookie,
    });

    expect(res.statusCode).toBe(204);
    expect(await rowsOf(projectId)).toHaveLength(0);
  });
});
