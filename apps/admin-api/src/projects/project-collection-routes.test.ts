import { createDb, insertProject, listAccessibleProjects, type DbConnection } from "@gw/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type App } from "../app.ts";
import type { Config } from "../config.ts";
import { apiRequest } from "../testing/api-requests.ts";
import { signUpUser } from "../testing/auth-requests.ts";
import { createProject, type ProjectJson } from "../testing/project-requests.ts";
import { testConfig } from "../testing/test-config.ts";

type ErrorJson = { error: { code: string; message: string; details?: { path: string }[] } };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

describe("project collection routes", () => {
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

  // payload undefined: no body; null, arrays and numbers are sent as JSON
  const post = (cookie: string, payload?: unknown) =>
    apiRequest(app, config, { method: "POST", url: "/api/projects", cookie, payload });

  const list = (cookie: string) =>
    apiRequest(app, config, { method: "GET", url: "/api/projects", cookie });

  const namesOf = (userId: string) =>
    listAccessibleProjects(connection.db, userId).then((rows) => rows.map((row) => row.name));

  describe("POST /api/projects", () => {
    it("creates a project: 201 with exactly id, name, createdAt, updatedAt", async () => {
      const { cookie, userId } = await signUpUser(app, config);

      const res = await post(cookie, { name: "Prod" });

      expect(res.statusCode).toBe(201);
      const body = res.json<ProjectJson>();
      expect(Object.keys(body).sort()).toEqual(["createdAt", "id", "name", "updatedAt"]);
      expect(body.name).toBe("Prod");
      expect(body.createdAt).toMatch(ISO_DATE);
      expect(body.updatedAt).toMatch(ISO_DATE);
      expect(res.headers["cache-control"]).toBe("no-store");
      // owned by the logged-in user
      expect(await listAccessibleProjects(connection.db, userId)).toMatchObject([
        { id: body.id, ownerId: userId },
      ]);
    });

    it("stores a trimmed name", async () => {
      const { cookie, userId } = await signUpUser(app, config);

      const res = await post(cookie, { name: "  Prod  " });

      expect(res.statusCode).toBe(201);
      expect(res.json<ProjectJson>().name).toBe("Prod");
      expect(await namesOf(userId)).toEqual(["Prod"]);
    });

    it("accepts a 100-character name", async () => {
      const { cookie } = await signUpUser(app, config);
      expect((await post(cookie, { name: "a".repeat(100) })).statusCode).toBe(201);
    });

    it.each([
      ["empty", { name: "" }],
      ["whitespace only", { name: "   " }],
      ["101 characters", { name: "a".repeat(101) }],
      ["a number", { name: 5 }],
      ["missing", {}],
    ])("rejects a name that is %s: 400 VALIDATION_FAILED, nothing stored", async (_label, body) => {
      const { cookie, userId } = await signUpUser(app, config);

      const res = await post(cookie, body);

      expect(res.statusCode).toBe(400);
      expect(res.json<ErrorJson>().error.code).toBe("VALIDATION_FAILED");
      expect(await namesOf(userId)).toEqual([]);
    });

    it.each([
      ["a NUL byte", "a\u0000b"],
      ["a newline inside", "a\nb"],
      ["a trailing newline", "Prod\n"],
      ["a tab", "a\tb"],
      ["a BEL character", "a\u0007b"],
      ["a bidi override (RLO)", "a\u202Eb"],
      ["a bidi isolate (LRI)", "a\u2066b"],
    ])("rejects a name with %s: 400 VALIDATION_FAILED, not a 500", async (_label, name) => {
      const { cookie, userId } = await signUpUser(app, config);

      const res = await post(cookie, { name });

      expect(res.statusCode).toBe(400);
      expect(res.json<ErrorJson>().error.code).toBe("VALIDATION_FAILED");
      expect(await namesOf(userId)).toEqual([]);
    });

    it.each([
      ["a ZWJ emoji", "👨\u200D👩\u200D👧 team"],
      ["a Persian name with ZWNJ", "می\u200Cخواهم"],
      ["an accented name", "café"],
    ])("accepts %s", async (_label, name) => {
      const { cookie } = await signUpUser(app, config);
      const res = await post(cookie, { name });
      expect(res.statusCode).toBe(201);
      expect(res.json<ProjectJson>().name).toBe(name);
    });

    it("normalizes to NFC: NFD and NFC café are the same name", async () => {
      const { cookie, userId } = await signUpUser(app, config);
      const nfd = "cafe\u0301";
      const nfc = "caf\u00E9";

      const first = await post(cookie, { name: nfd });
      const second = await post(cookie, { name: nfc });

      expect(first.statusCode).toBe(201);
      expect(first.json<ProjectJson>().name).toBe(nfc);
      expect(second.statusCode).toBe(409);
      expect(await namesOf(userId)).toEqual([nfc]);
    });

    it("measures the length after NFC: 100 decomposed é is accepted, 101 is not", async () => {
      const { cookie } = await signUpUser(app, config);

      expect((await post(cookie, { name: "e\u0301".repeat(100) })).statusCode).toBe(201);
      expect((await post(cookie, { name: "e\u0301".repeat(101) })).statusCode).toBe(400);
    });

    it("counts code points like Postgres: 100 emoji are accepted, 101 are not", async () => {
      const { cookie, userId } = await signUpUser(app, config);

      expect((await post(cookie, { name: "😀".repeat(100) })).statusCode).toBe(201);
      expect((await post(cookie, { name: "😀".repeat(101) })).statusCode).toBe(400);
      expect(await namesOf(userId)).toEqual(["😀".repeat(100)]);
    });

    it.each([
      ["an array", [{ name: "Prod" }]],
      ["null", null],
      ["a number", 5],
      ["a string", "Prod"],
    ])("rejects a body that is %s: 400 in our shape", async (_label, body) => {
      const { cookie, userId } = await signUpUser(app, config);

      const res = await post(cookie, body);

      expect(res.statusCode).toBe(400);
      expect(res.json<ErrorJson>().error.code).toBe("VALIDATION_FAILED");
      expect(await namesOf(userId)).toEqual([]);
    });

    it("rejects a request with no body: 400", async () => {
      const { cookie } = await signUpUser(app, config);
      const res = await post(cookie);
      expect(res.statusCode).toBe(400);
      expect(res.json<ErrorJson>().error.code).toBe("VALIDATION_FAILED");
    });

    it.each(["ownerId", "id", "createdAt"])(
      "rejects an extra field %s (mass assignment): 400, nothing stored",
      async (field) => {
        const { cookie, userId } = await signUpUser(app, config);
        const other = await signUpUser(app, config);

        const res = await post(cookie, { name: "Prod", [field]: other.userId });

        expect(res.statusCode).toBe(400);
        expect(res.json<ErrorJson>().error.code).toBe("VALIDATION_FAILED");
        expect(await namesOf(userId)).toEqual([]);
        expect(await namesOf(other.userId)).toEqual([]);
      },
    );

    it("answers 409 for a duplicate name, also after trimming", async () => {
      const { cookie, userId } = await signUpUser(app, config);
      await createProject(app, config, cookie, "Prod");

      for (const name of ["Prod", "  Prod  "]) {
        const res = await post(cookie, { name });
        expect(res.statusCode).toBe(409);
        expect(res.json<ErrorJson>().error).toMatchObject({
          code: "CONFLICT",
          message: "A project with this name already exists",
        });
      }
      expect(await namesOf(userId)).toEqual(["Prod"]);
    });

    it("allows the same name for another user", async () => {
      const [a, b] = [await signUpUser(app, config), await signUpUser(app, config)];
      await createProject(app, config, a.cookie, "Prod");

      expect((await post(b.cookie, { name: "Prod" })).statusCode).toBe(201);
    });

    it("treats names as case-sensitive", async () => {
      const { cookie } = await signUpUser(app, config);
      await createProject(app, config, cookie, "Prod");
      expect((await post(cookie, { name: "prod" })).statusCode).toBe(201);
    });

    it("answers 409 for the 101st project, and the cap is per user", async () => {
      const { cookie, userId } = await signUpUser(app, config);
      for (let n = 1; n <= 100; n++) {
        await insertProject(connection.db, userId, `p${n}`);
      }

      const res = await post(cookie, { name: "one-too-many" });

      expect(res.statusCode).toBe(409);
      expect(res.json<ErrorJson>().error).toMatchObject({
        code: "CONFLICT",
        message: "Project limit reached (100)",
      });
      expect(await namesOf(userId)).not.toContain("one-too-many");
      const other = await signUpUser(app, config);
      expect((await post(other.cookie, { name: "p1" })).statusCode).toBe(201);
    });

    it("keeps the cap exact under parallel creates: 20 at 99 give one 201 and nineteen 409", async () => {
      const { cookie, userId } = await signUpUser(app, config);
      for (let n = 1; n <= 99; n++) await insertProject(connection.db, userId, `p${n}`);

      const responses = await Promise.all(
        Array.from({ length: 20 }, (_, n) => post(cookie, { name: `race${n}` })),
      );

      const statuses = responses.map((res) => res.statusCode).sort();
      expect(statuses).toEqual([201, ...Array<number>(19).fill(409)]);
      for (const res of responses.filter((r) => r.statusCode === 409)) {
        expect(res.json<ErrorJson>().error).toMatchObject({
          code: "CONFLICT",
          message: "Project limit reached (100)",
        });
      }
      expect(await namesOf(userId)).toHaveLength(100);
    });

    it("caps each user on their own: parallel creates for two users both end at exactly 100", async () => {
      const [a, b] = [await signUpUser(app, config), await signUpUser(app, config)];
      for (const { userId } of [a, b]) {
        for (let n = 1; n <= 99; n++) await insertProject(connection.db, userId, `p${n}`);
      }

      const responses = await Promise.all(
        Array.from({ length: 10 }, (_, n) => [
          post(a.cookie, { name: `a${n}` }),
          post(b.cookie, { name: `b${n}` }),
        ]).flat(),
      );

      const created = responses.filter((res) => res.statusCode === 201);
      const refused = responses.filter((res) => res.statusCode === 409);
      expect(created).toHaveLength(2); // one each
      expect(refused).toHaveLength(18);
      expect(await namesOf(a.userId)).toHaveLength(100);
      expect(await namesOf(b.userId)).toHaveLength(100);
    });

    it("answers 403 without an Origin", async () => {
      const { cookie, userId } = await signUpUser(app, config);

      const res = await apiRequest(app, config, {
        method: "POST",
        url: "/api/projects",
        cookie,
        payload: { name: "Prod" },
        origin: null,
      });

      expect(res.statusCode).toBe(403);
      expect(res.json<ErrorJson>().error.code).toBe("FORBIDDEN");
      expect(await namesOf(userId)).toEqual([]);
    });

    it("answers 401 without a session", async () => {
      const res = await apiRequest(app, config, {
        method: "POST",
        url: "/api/projects",
        payload: { name: "Prod" },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("GET /api/projects", () => {
    it("lists only my projects, sorted by name, in the wrapped shape", async () => {
      const [me, other] = [await signUpUser(app, config), await signUpUser(app, config)];
      await createProject(app, config, me.cookie, "b");
      await createProject(app, config, me.cookie, "a");
      await createProject(app, config, other.cookie, "c");

      const res = await list(me.cookie);

      expect(res.statusCode).toBe(200);
      const { projects } = res.json<{ projects: ProjectJson[] }>();
      expect(projects.map((project) => project.name)).toEqual(["a", "b"]);
      for (const project of projects) {
        expect(Object.keys(project).sort()).toEqual(["createdAt", "id", "name", "updatedAt"]);
      }
    });

    it("returns an empty list for a new user", async () => {
      const { cookie } = await signUpUser(app, config);
      const res = await list(cookie);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ projects: [] });
    });

    it("answers 401 without a session", async () => {
      const res = await apiRequest(app, config, { method: "GET", url: "/api/projects" });
      expect(res.statusCode).toBe(401);
    });
  });
});
