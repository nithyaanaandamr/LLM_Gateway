import { randomUUID } from "node:crypto";
import { createDb, findAccessibleProject, type DbConnection } from "@gw/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type App } from "../app.ts";
import type { Config } from "../config.ts";
import { apiRequest } from "../testing/api-requests.ts";
import { signUpUser } from "../testing/auth-requests.ts";
import { createProject, type ProjectJson } from "../testing/project-requests.ts";
import { testConfig } from "../testing/test-config.ts";

type ErrorJson = { error: { code: string; message: string } };

describe("project item routes", () => {
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

  const call = (
    cookie: string,
    method: "GET" | "PATCH" | "DELETE",
    id: string,
    extra: { payload?: unknown; origin?: string | null } = {},
  ) => apiRequest(app, config, { method, url: `/api/projects/${id}`, cookie, ...extra });

  const rowOf = (userId: string, projectId: string) =>
    findAccessibleProject(connection.db, userId, projectId);

  describe("GET /api/projects/:projectId", () => {
    it("returns my project with exactly id, name, createdAt, updatedAt", async () => {
      const { cookie } = await signUpUser(app, config);
      const project = await createProject(app, config, cookie, "Prod");

      const res = await call(cookie, "GET", project.id);

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(project);
      expect(Object.keys(res.json<ProjectJson>()).sort()).toEqual([
        "createdAt",
        "id",
        "name",
        "updatedAt",
      ]);
      expect(res.headers["cache-control"]).toBe("no-store");
    });
  });

  describe("PATCH /api/projects/:projectId", () => {
    it("renames: 200 with the new name and a later updatedAt", async () => {
      const { cookie } = await signUpUser(app, config);
      const project = await createProject(app, config, cookie, "old");

      const res = await call(cookie, "PATCH", project.id, { payload: { name: "  new  " } });

      expect(res.statusCode).toBe(200);
      const body = res.json<ProjectJson>();
      expect(body).toMatchObject({ id: project.id, name: "new", createdAt: project.createdAt });
      expect(Date.parse(body.updatedAt)).toBeGreaterThan(Date.parse(project.updatedAt));
    });

    it("answers 409 for a name that another of my projects has, and changes nothing", async () => {
      const { cookie, userId } = await signUpUser(app, config);
      await createProject(app, config, cookie, "taken");
      const project = await createProject(app, config, cookie, "mine");

      const res = await call(cookie, "PATCH", project.id, { payload: { name: "taken" } });

      expect(res.statusCode).toBe(409);
      expect(res.json<ErrorJson>().error).toMatchObject({
        code: "CONFLICT",
        message: "A project with this name already exists",
      });
      expect((await rowOf(userId, project.id))?.name).toBe("mine");
    });

    it("lets another user's project keep my name: names are per user", async () => {
      const [a, b] = [await signUpUser(app, config), await signUpUser(app, config)];
      await createProject(app, config, a.cookie, "shared");
      const project = await createProject(app, config, b.cookie, "other");

      const res = await call(b.cookie, "PATCH", project.id, { payload: { name: "shared" } });

      expect(res.statusCode).toBe(200);
    });

    it.each([
      ["an empty name", { name: "" }],
      ["a NUL byte", { name: "a\u0000b" }],
      ["an extra field", { name: "x", ownerId: randomUUID() }],
      ["no name", {}],
      ["an array", [{ name: "x" }]],
      ["null", null],
    ])("rejects %s: 400 VALIDATION_FAILED, name unchanged", async (_label, payload) => {
      const { cookie, userId } = await signUpUser(app, config);
      const project = await createProject(app, config, cookie, "keep");

      const res = await call(cookie, "PATCH", project.id, { payload });

      expect(res.statusCode).toBe(400);
      expect(res.json<ErrorJson>().error.code).toBe("VALIDATION_FAILED");
      expect((await rowOf(userId, project.id))?.name).toBe("keep");
    });

    it("answers 403 without an Origin", async () => {
      const { cookie, userId } = await signUpUser(app, config);
      const project = await createProject(app, config, cookie, "keep");

      const res = await call(cookie, "PATCH", project.id, {
        payload: { name: "new" },
        origin: null,
      });

      expect(res.statusCode).toBe(403);
      expect((await rowOf(userId, project.id))?.name).toBe("keep");
    });

    it("answers 404 for another user's project and leaves it unchanged", async () => {
      const [owner, intruder] = [await signUpUser(app, config), await signUpUser(app, config)];
      const project = await createProject(app, config, owner.cookie, "keep");

      const res = await call(intruder.cookie, "PATCH", project.id, { payload: { name: "mine" } });

      expect(res.statusCode).toBe(404);
      expect((await rowOf(owner.userId, project.id))?.name).toBe("keep");
    });
  });

  describe("DELETE /api/projects/:projectId", () => {
    it("deletes: 204, then GET is 404 and the row is gone", async () => {
      const { cookie, userId } = await signUpUser(app, config);
      const project = await createProject(app, config, cookie);

      const res = await call(cookie, "DELETE", project.id);

      expect(res.statusCode).toBe(204);
      expect(res.body).toBe("");
      expect((await call(cookie, "GET", project.id)).statusCode).toBe(404);
      expect(await rowOf(userId, project.id)).toBeUndefined();
    });

    it("answers 404 when deleted twice", async () => {
      const { cookie } = await signUpUser(app, config);
      const project = await createProject(app, config, cookie);
      await call(cookie, "DELETE", project.id);

      expect((await call(cookie, "DELETE", project.id)).statusCode).toBe(404);
    });

    it("answers 403 without an Origin and keeps the project", async () => {
      const { cookie, userId } = await signUpUser(app, config);
      const project = await createProject(app, config, cookie);

      const res = await call(cookie, "DELETE", project.id, { origin: null });

      expect(res.statusCode).toBe(403);
      expect(await rowOf(userId, project.id)).toBeDefined();
    });

    it("answers 404 for another user's project and keeps it", async () => {
      const [owner, intruder] = [await signUpUser(app, config), await signUpUser(app, config)];
      const project = await createProject(app, config, owner.cookie);

      const res = await call(intruder.cookie, "DELETE", project.id);

      expect(res.statusCode).toBe(404);
      expect(await rowOf(owner.userId, project.id)).toBeDefined();
    });

    it("frees the name for a new project", async () => {
      const { cookie } = await signUpUser(app, config);
      const project = await createProject(app, config, cookie, "again");
      await call(cookie, "DELETE", project.id);

      expect(await createProject(app, config, cookie, "again")).toMatchObject({ name: "again" });
    });
  });
});
