import { randomBytes, randomUUID } from "node:crypto";
import { hashGatewayKey, isGatewayKey } from "@gw/shared/crypto";
import {
  countActiveGatewayKeys,
  createDb,
  gatewayKeys,
  insertGatewayKey,
  listGatewayKeys,
  type DbConnection,
} from "@gw/db";
import { toDrizzle } from "@gw/db/testing";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type App } from "../app.ts";
import type { Config } from "../config.ts";
import { apiRequest } from "../testing/api-requests.ts";
import { signUpUser } from "../testing/auth-requests.ts";
import { createProject } from "../testing/project-requests.ts";
import { testConfig } from "../testing/test-config.ts";

type ErrorJson = { error: { code: string; message: string; details?: { path: string }[] } };
type GatewayKeyJson = {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  revokedAt: string | null;
};
type IssueJson = { key: string; gatewayKey: GatewayKeyJson };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const GATEWAY_KEY_FIELDS = ["createdAt", "id", "keyPrefix", "name", "revokedAt"];
const hexPartOf = (key: string) => key.slice("gw_live_".length);

describe("gateway key routes", () => {
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

  const urlOf = (projectId: string, keyId?: string) =>
    `/api/projects/${projectId}/gateway-keys${keyId === undefined ? "" : `/${keyId}`}`;

  // payload undefined: no body; anything else is sent as JSON
  const issue = (cookie: string, projectId: string, payload?: unknown) =>
    apiRequest(app, config, { method: "POST", url: urlOf(projectId), cookie, payload });

  const list = (cookie: string, projectId: string) =>
    apiRequest(app, config, { method: "GET", url: urlOf(projectId), cookie });

  const revoke = (cookie: string, projectId: string, keyId: string) =>
    apiRequest(app, config, { method: "DELETE", url: urlOf(projectId, keyId), cookie });

  async function issued(cookie: string, projectId: string, name = "ci"): Promise<IssueJson> {
    const res = await issue(cookie, projectId, { name });
    if (res.statusCode !== 201) throw new Error(`issue failed: ${res.statusCode} ${res.body}`);
    return res.json<IssueJson>();
  }

  async function userWithProject() {
    const user = await signUpUser(app, config);
    const project = await createProject(app, config, user.cookie);
    return { ...user, projectId: project.id };
  }

  // Active keys put straight into the DB, so cap tests don't need 20 requests each
  async function fillWithKeys(projectId: string, count: number) {
    for (let n = 1; n <= count; n++) {
      await insertGatewayKey(connection.db, {
        projectId,
        name: `k${n}`,
        keyHash: randomBytes(32),
        keyPrefix: "gw_live_0000",
      });
    }
  }

  const rowText = async (keyId: string): Promise<string> => {
    const result = await toDrizzle(connection.db).execute<{ text: string }>(
      sql`select (k.*)::text as text from app.gateway_keys k where k.id = ${keyId}`,
    );
    return result.rows[0]?.text ?? "";
  };

  const revokedAtOf = async (projectId: string, keyId: string) =>
    (await listGatewayKeys(connection.db, projectId)).find((key) => key.id === keyId)?.revokedAt;

  describe("POST /api/projects/:projectId/gateway-keys", () => {
    it("issues a key: 201, a valid key, its 12-character prefix, not revoked, no-store", async () => {
      const { cookie, projectId } = await userWithProject();

      const res = await issue(cookie, projectId, { name: "ci" });

      expect(res.statusCode).toBe(201);
      const { key, gatewayKey } = res.json<IssueJson>();
      expect(Object.keys(res.json<IssueJson>()).sort()).toEqual(["gatewayKey", "key"]);
      expect(isGatewayKey(key)).toBe(true);
      expect(Object.keys(gatewayKey).sort()).toEqual(GATEWAY_KEY_FIELDS);
      expect(gatewayKey).toMatchObject({ name: "ci", revokedAt: null });
      expect(gatewayKey.keyPrefix).toBe(key.slice(0, 12));
      expect(gatewayKey.createdAt).toMatch(ISO_DATE);
      expect(res.headers["cache-control"]).toBe("no-store");
    });

    it("stores only the hash and prefix: key_hash is the key's hash, no column holds the key", async () => {
      const { cookie, projectId } = await userWithProject();

      const { key, gatewayKey } = await issued(cookie, projectId);

      const [row] = await toDrizzle(connection.db)
        .select()
        .from(gatewayKeys)
        .where(eq(gatewayKeys.id, gatewayKey.id));
      expect(row?.keyHash.equals(hashGatewayKey(key))).toBe(true);
      expect(row?.keyPrefix).toBe(key.slice(0, 12));
      expect(row?.projectId).toBe(projectId);
      const text = await rowText(gatewayKey.id);
      expect(text).not.toContain(hexPartOf(key));
      expect(text).not.toContain(key);
    });

    it("gives every key a different value and hash", async () => {
      const { cookie, projectId } = await userWithProject();

      const [a, b] = [await issued(cookie, projectId), await issued(cookie, projectId)];

      expect(a.key).not.toBe(b.key);
      expect(a.gatewayKey.id).not.toBe(b.gatewayKey.id);
    });

    it("accepts an uppercase projectId in the URL and stores the lowercase one", async () => {
      const { cookie, projectId } = await userWithProject();

      const res = await issue(cookie, projectId.toUpperCase(), { name: "ci" });

      expect(res.statusCode).toBe(201);
      expect(await listGatewayKeys(connection.db, projectId)).toHaveLength(1);
    });

    it('trims the name: "  ci  " is stored as "ci"', async () => {
      const { cookie, projectId } = await userWithProject();

      const { gatewayKey } = await issued(cookie, projectId, "  ci  ");

      expect(gatewayKey.name).toBe("ci");
    });

    it("accepts a 100-character name and refuses 101", async () => {
      const { cookie, projectId } = await userWithProject();

      expect((await issue(cookie, projectId, { name: "a".repeat(100) })).statusCode).toBe(201);
      expect((await issue(cookie, projectId, { name: "a".repeat(101) })).statusCode).toBe(400);
    });

    it("allows two keys with the same name", async () => {
      const { cookie, projectId } = await userWithProject();
      await issued(cookie, projectId, "same");

      expect((await issue(cookie, projectId, { name: "same" })).statusCode).toBe(201);
    });

    it.each([
      ["no body", undefined],
      ["an empty name", { name: "" }],
      ["a whitespace-only name", { name: "   " }],
      ["a name with a control character", { name: "a\u0000b" }],
      ["a name that is not a string", { name: 5 }],
      ["no name", {}],
      ["an extra field: projectId", { name: "ci", projectId: randomUUID() }],
      ["an extra field: keyHash", { name: "ci", keyHash: "00" }],
      ["an array", [{ name: "ci" }]],
      ["null", null],
    ])("rejects %s: 400 VALIDATION_FAILED and no key stored", async (_label, payload) => {
      const { cookie, projectId } = await userWithProject();

      const res = await issue(cookie, projectId, payload);

      expect(res.statusCode).toBe(400);
      expect(res.json<ErrorJson>().error.code).toBe("VALIDATION_FAILED");
      expect(await listGatewayKeys(connection.db, projectId)).toEqual([]);
    });

    it("answers 409 for the 21st active key, and works again after one is revoked", async () => {
      const { cookie, projectId } = await userWithProject();
      await fillWithKeys(projectId, 20);

      const refused = await issue(cookie, projectId, { name: "one-too-many" });

      expect(refused.statusCode).toBe(409);
      expect(refused.json<ErrorJson>().error).toMatchObject({
        code: "CONFLICT",
        message: "Active gateway key limit reached (20)",
      });
      expect(await countActiveGatewayKeys(connection.db, projectId)).toBe(20);
      const [first] = await listGatewayKeys(connection.db, projectId);
      expect((await revoke(cookie, projectId, first!.id)).statusCode).toBe(204);
      expect((await issue(cookie, projectId, { name: "again" })).statusCode).toBe(201);
    });

    it("counts each project's keys on their own", async () => {
      const { cookie, projectId } = await userWithProject();
      const second = await createProject(app, config, cookie);
      await fillWithKeys(projectId, 20);

      expect((await issue(cookie, second.id, { name: "ci" })).statusCode).toBe(201);
    });

    it("keeps the cap exact under parallel creates: 20 at 19 give one 201 and nineteen 409", async () => {
      const { cookie, projectId } = await userWithProject();
      await fillWithKeys(projectId, 19);

      const responses = await Promise.all(
        Array.from({ length: 20 }, (_, n) => issue(cookie, projectId, { name: `race${n}` })),
      );

      const statuses = responses.map((res) => res.statusCode).sort();
      expect(statuses).toEqual([201, ...Array<number>(19).fill(409)]);
      for (const res of responses.filter((r) => r.statusCode === 409)) {
        expect(res.json<ErrorJson>().error).toMatchObject({
          code: "CONFLICT",
          message: "Active gateway key limit reached (20)",
        });
      }
      expect(await countActiveGatewayKeys(connection.db, projectId)).toBe(20);
    });

    it("caps each project on its own: parallel creates for two projects both end at exactly 20", async () => {
      const { cookie, projectId: first } = await userWithProject();
      const second = (await createProject(app, config, cookie)).id;
      await fillWithKeys(first, 19);
      await fillWithKeys(second, 19);

      const responses = await Promise.all(
        Array.from({ length: 10 }, (_, n) => [
          issue(cookie, first, { name: `a${n}` }),
          issue(cookie, second, { name: `b${n}` }),
        ]).flat(),
      );

      expect(responses.filter((res) => res.statusCode === 201)).toHaveLength(2); // one each
      expect(responses.filter((res) => res.statusCode === 409)).toHaveLength(18);
      expect(await countActiveGatewayKeys(connection.db, first)).toBe(20);
      expect(await countActiveGatewayKeys(connection.db, second)).toBe(20);
    });

    it("answers 403 without an Origin and stores nothing", async () => {
      const { cookie, projectId } = await userWithProject();

      const res = await apiRequest(app, config, {
        method: "POST",
        url: urlOf(projectId),
        cookie,
        payload: { name: "ci" },
        origin: null,
      });

      expect(res.statusCode).toBe(403);
      expect(await listGatewayKeys(connection.db, projectId)).toEqual([]);
    });

    it("answers 401 without a session", async () => {
      const { projectId } = await userWithProject();
      const res = await apiRequest(app, config, {
        method: "POST",
        url: urlOf(projectId),
        payload: { name: "ci" },
      });
      expect(res.statusCode).toBe(401);
    });

    it("answers 404 for another user's project and writes nothing", async () => {
      const owner = await userWithProject();
      const intruder = await signUpUser(app, config);

      const res = await issue(intruder.cookie, owner.projectId, { name: "ci" });

      expect(res.statusCode).toBe(404);
      expect(res.json<ErrorJson>().error.message).toBe("Project not found");
      expect(await listGatewayKeys(connection.db, owner.projectId)).toEqual([]);
    });
  });

  describe("GET /api/projects/:projectId/gateway-keys", () => {
    it("returns an empty list for a project with no keys", async () => {
      const { cookie, projectId } = await userWithProject();

      const res = await list(cookie, projectId);

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ gatewayKeys: [] });
      expect(res.headers["cache-control"]).toBe("no-store");
    });

    it("lists newest first with exactly the GatewayKey fields, revoked included", async () => {
      const { cookie, projectId } = await userWithProject();
      const first = await issued(cookie, projectId, "first");
      const second = await issued(cookie, projectId, "second");
      await revoke(cookie, projectId, first.gatewayKey.id);

      const res = await list(cookie, projectId);

      const { gatewayKeys: items } = res.json<{ gatewayKeys: GatewayKeyJson[] }>();
      expect(items.map((item) => item.name)).toEqual(["second", "first"]);
      for (const item of items) expect(Object.keys(item).sort()).toEqual(GATEWAY_KEY_FIELDS);
      expect(items[0]).toEqual(second.gatewayKey);
      expect(items[1]?.revokedAt).toMatch(ISO_DATE);
    });

    it("never shows a key: the raw text has no 64-hex part of any issued key", async () => {
      const { cookie, projectId } = await userWithProject();
      const keys = [await issued(cookie, projectId), await issued(cookie, projectId)];

      const res = await list(cookie, projectId);

      for (const { key } of keys) {
        expect(res.body).not.toContain(hexPartOf(key));
        expect(res.body).not.toContain(key);
      }
      expect(res.body).not.toMatch(/[0-9a-f]{64}/);
      expect(res.body).not.toContain("keyHash");
    });

    it("lists only this project's keys", async () => {
      const { cookie, projectId } = await userWithProject();
      const other = await createProject(app, config, cookie);
      await issued(cookie, projectId, "mine");
      await issued(cookie, other.id, "theirs");

      const { gatewayKeys: items } = (await list(cookie, projectId)).json<{
        gatewayKeys: GatewayKeyJson[];
      }>();

      expect(items.map((item) => item.name)).toEqual(["mine"]);
    });

    it("answers 404 for another user's project", async () => {
      const owner = await userWithProject();
      await issued(owner.cookie, owner.projectId);
      const intruder = await signUpUser(app, config);

      const res = await list(intruder.cookie, owner.projectId);

      expect(res.statusCode).toBe(404);
      expect(res.json<ErrorJson>().error.message).toBe("Project not found");
    });
  });

  describe("DELETE /api/projects/:projectId/gateway-keys/:keyId", () => {
    it("revokes: 204 with no body, revokedAt set, the row kept", async () => {
      const { cookie, projectId } = await userWithProject();
      const { gatewayKey } = await issued(cookie, projectId);

      const res = await revoke(cookie, projectId, gatewayKey.id);

      expect(res.statusCode).toBe(204);
      expect(res.body).toBe("");
      expect(await revokedAtOf(projectId, gatewayKey.id)).toBeInstanceOf(Date);
      const { gatewayKeys: items } = (await list(cookie, projectId)).json<{
        gatewayKeys: GatewayKeyJson[];
      }>();
      expect(items[0]?.revokedAt).toMatch(ISO_DATE);
    });

    it("is idempotent: a second DELETE is 204 with the same revokedAt", async () => {
      const { cookie, projectId } = await userWithProject();
      const { gatewayKey } = await issued(cookie, projectId);
      await revoke(cookie, projectId, gatewayKey.id);
      const first = await revokedAtOf(projectId, gatewayKey.id);

      const res = await revoke(cookie, projectId, gatewayKey.id);

      expect(res.statusCode).toBe(204);
      expect(await revokedAtOf(projectId, gatewayKey.id)).toEqual(first);
    });

    it("answers 404 'Gateway key not found' for a missing key", async () => {
      const { cookie, projectId } = await userWithProject();

      const res = await revoke(cookie, projectId, randomUUID());

      expect(res.statusCode).toBe(404);
      expect(res.json<ErrorJson>().error).toMatchObject({
        code: "NOT_FOUND",
        message: "Gateway key not found",
      });
    });

    it("answers 400 when keyId is not a UUID", async () => {
      const { cookie, projectId } = await userWithProject();

      const res = await revoke(cookie, projectId, "not-a-uuid");

      expect(res.statusCode).toBe(400);
      expect(res.json<ErrorJson>().error.code).toBe("VALIDATION_FAILED");
    });

    it("IDOR: another project of mine cannot revoke this key (404, key stays active)", async () => {
      const { cookie, projectId: p1 } = await userWithProject();
      const p2 = (await createProject(app, config, cookie)).id;
      const { gatewayKey } = await issued(cookie, p2);

      const res = await revoke(cookie, p1, gatewayKey.id);

      expect(res.statusCode).toBe(404);
      expect(res.json<ErrorJson>().error.message).toBe("Gateway key not found");
      expect(await revokedAtOf(p2, gatewayKey.id)).toBeNull();
    });

    it("IDOR: another user's key under my project is a 404 and stays active", async () => {
      const [mine, theirs] = [await userWithProject(), await userWithProject()];
      const { gatewayKey } = await issued(theirs.cookie, theirs.projectId);

      const res = await revoke(mine.cookie, mine.projectId, gatewayKey.id);

      expect(res.statusCode).toBe(404);
      expect(await revokedAtOf(theirs.projectId, gatewayKey.id)).toBeNull();
    });

    it("answers 404 for another user's project and leaves the key active", async () => {
      const owner = await userWithProject();
      const { gatewayKey } = await issued(owner.cookie, owner.projectId);
      const intruder = await signUpUser(app, config);

      const res = await revoke(intruder.cookie, owner.projectId, gatewayKey.id);

      expect(res.statusCode).toBe(404);
      expect(res.json<ErrorJson>().error.message).toBe("Project not found");
      expect(await revokedAtOf(owner.projectId, gatewayKey.id)).toBeNull();
    });

    it("answers 403 without an Origin and leaves the key active", async () => {
      const { cookie, projectId } = await userWithProject();
      const { gatewayKey } = await issued(cookie, projectId);

      const res = await apiRequest(app, config, {
        method: "DELETE",
        url: urlOf(projectId, gatewayKey.id),
        cookie,
        origin: null,
      });

      expect(res.statusCode).toBe(403);
      expect(await revokedAtOf(projectId, gatewayKey.id)).toBeNull();
    });

    it("frees a slot under the cap: revoked keys are not counted", async () => {
      const { cookie, projectId } = await userWithProject();
      const { gatewayKey } = await issued(cookie, projectId);
      await revoke(cookie, projectId, gatewayKey.id);

      expect(await countActiveGatewayKeys(connection.db, projectId)).toBe(0);
    });
  });

  describe("deleting a project", () => {
    it("removes its gateway keys, revoked or not", async () => {
      const { cookie, projectId } = await userWithProject();
      const active = await issued(cookie, projectId);
      const revoked = await issued(cookie, projectId);
      await revoke(cookie, projectId, revoked.gatewayKey.id);

      const res = await apiRequest(app, config, {
        method: "DELETE",
        url: `/api/projects/${projectId}`,
        cookie,
      });

      expect(res.statusCode).toBe(204);
      expect(await listGatewayKeys(connection.db, projectId)).toEqual([]);
      expect(await rowText(active.gatewayKey.id)).toBe("");
      expect(await rowText(revoked.gatewayKey.id)).toBe("");
    });
  });
});
