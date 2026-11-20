import { randomUUID } from "node:crypto";
import { createDb, type DbConnection } from "@gw/db";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type App } from "../app.ts";
import type { Config } from "../config.ts";
import { errorHandler } from "../error-handler.ts";
import { apiRequest } from "../testing/api-requests.ts";
import { signUpUser } from "../testing/auth-requests.ts";
import { createProject } from "../testing/project-requests.ts";
import { testConfig } from "../testing/test-config.ts";
import { getProject } from "./get-project.ts";
import { projectScope } from "./project-scope.ts";

type ErrorJson = { error: { code: string; message: string; requestId: string } };

describe("project scope hook (through the real app)", () => {
  let config: Config;
  let app: App;

  beforeAll(async () => {
    config = await testConfig();
    app = buildApp(config);
  });

  afterAll(() => app.close());

  const call = (
    cookie: string,
    method: "GET" | "PATCH" | "DELETE",
    projectId: string,
    payload?: unknown,
  ) => apiRequest(app, config, { method, url: `/api/projects/${projectId}`, cookie, payload });

  // The same answer for "not yours" and "does not exist", apart from the per-request id
  const shape = (res: { statusCode: number; json: <T>() => T }) => {
    const { error } = res.json<ErrorJson>();
    return { status: res.statusCode, code: error.code, message: error.message };
  };

  it("answers 404 NOT_FOUND for a non-UUID projectId, before any body check", async () => {
    const { cookie } = await signUpUser(app, config);

    for (const id of ["not-a-uuid", "123", "0".repeat(32), "%7B1%7D"]) {
      const res = await call(cookie, "PATCH", id, { nope: true });
      expect(shape(res)).toEqual({ status: 404, code: "NOT_FOUND", message: "Project not found" });
    }
  });

  it("answers 404 for another user's project, identical to a random UUID", async () => {
    const [owner, intruder] = [await signUpUser(app, config), await signUpUser(app, config)];
    const project = await createProject(app, config, owner.cookie);

    const theirs = await call(intruder.cookie, "GET", project.id);
    const missing = await call(intruder.cookie, "GET", randomUUID());

    expect(shape(theirs)).toEqual({ status: 404, code: "NOT_FOUND", message: "Project not found" });
    expect(shape(theirs)).toEqual(shape(missing));
  });

  it("checks access before the body: a broken PATCH body on another user's project is 404, not 400", async () => {
    const [owner, intruder] = [await signUpUser(app, config), await signUpUser(app, config)];
    const project = await createProject(app, config, owner.cookie);

    const res = await call(intruder.cookie, "PATCH", project.id, { name: "", ownerId: "x" });

    expect(res.statusCode).toBe(404);
  });

  it("answers 401 without a session, before the project check", async () => {
    const res = await apiRequest(app, config, {
      method: "GET",
      url: `/api/projects/${randomUUID()}`,
    });
    expect(res.statusCode).toBe(401);
  });

  it("accepts an uppercase projectId and uses the database's lowercase id", async () => {
    const { cookie } = await signUpUser(app, config);
    const project = await createProject(app, config, cookie);

    const res = await call(cookie, "GET", project.id.toUpperCase());

    expect(res.statusCode).toBe(200);
    expect(res.json<{ id: string }>().id).toBe(project.id);
  });
});

describe("projectScope guard", () => {
  let connection: DbConnection;

  beforeAll(async () => {
    connection = createDb((await testConfig()).databaseUrl);
  });

  afterAll(() => connection.close());

  // An async plugin turns a throw into a rejection, so ready() reports it. A callback-style
  // plugin that throws makes an uncaught exception instead: the process stops at startup.
  function appWithScope(register: (scope: FastifyInstance) => void) {
    const app = Fastify();
    void app.register(async (scope) => {
      projectScope(scope, { db: connection.db });
      register(scope);
      await Promise.resolve(); // makes this a real async plugin
    });
    return app;
  }

  it("lets app.ready() resolve when every route has :projectId", async () => {
    const app = appWithScope((scope) => {
      scope.get("/api/projects/:projectId/things", () => ({}));
    });
    await expect(app.ready()).resolves.toBeDefined();
    await app.close();
  });

  it("rejects app.ready() for a route without :projectId", async () => {
    const app = appWithScope((scope) => {
      scope.get("/api/things", () => ({}));
    });
    await expect(app.ready()).rejects.toThrow(/no :projectId/);
    await app.close().catch(() => {});
  });

  it("also rejects a route with a different param name, and one in a child plugin", async () => {
    const other = appWithScope((scope) => {
      scope.get("/api/projects/:id", () => ({}));
    });
    await expect(other.ready()).rejects.toThrow(/no :projectId/);

    const nested = appWithScope((scope) => {
      void scope.register(async (child) => {
        child.get("/api/things", () => ({}));
        await Promise.resolve();
      });
    });
    await expect(nested.ready()).rejects.toThrow(/no :projectId/);
    await other.close().catch(() => {});
    await nested.close().catch(() => {});
  });
});

describe("getProject", () => {
  it("is a logged 500 in a route outside the project scope", async () => {
    const lines: string[] = [];
    const app = Fastify({
      logger: { level: "error", stream: { write: (line: string) => lines.push(line) } },
    });
    app.setErrorHandler(errorHandler);
    app.get("/x", (request) => getProject(request));

    const res = await app.inject("/x");

    expect(res.statusCode).toBe(500);
    expect(res.json<ErrorJson>().error.code).toBe("INTERNAL");
    expect(lines.join("")).toContain("request failed");
  });
});
