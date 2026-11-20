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

  const BAD = "Routes in the project scope must have :projectId in the path: /api/things";

  // Plugins the way the app writes them (callback style) and the async way
  type Plugin = (scope: FastifyInstance, register: (scope: FastifyInstance) => void) => void;
  const callbackPlugin: Plugin = (scope, register) => {
    void scope.register((inner, _options, done) => {
      projectScope(inner, { db: connection.db });
      register(inner);
      done();
    });
  };
  const asyncPlugin: Plugin = (scope, register) => {
    void scope.register(async (inner) => {
      projectScope(inner, { db: connection.db });
      register(inner);
      await Promise.resolve();
    });
  };

  async function readyOutcome(plugin: Plugin, register: (scope: FastifyInstance) => void) {
    const app = Fastify();
    plugin(app, register);
    const outcome = await app.ready().then(
      () => "ready",
      (error: Error) => error.message,
    );
    await app.close().catch(() => {});
    return outcome;
  }

  // A hang would stop the test at the timeout instead of settling
  describe.each([
    ["callback", callbackPlugin],
    ["async", asyncPlugin],
  ])("%s plugin", (_name, plugin) => {
    it("lets ready() resolve when every route has :projectId", async () => {
      const outcome = await readyOutcome(plugin, (scope) => {
        scope.get("/api/projects/:projectId/things", () => ({}));
      });
      expect(outcome).toBe("ready");
    });

    it("rejects ready() for a route without :projectId, naming it once (not once per HEAD)", async () => {
      const outcome = await readyOutcome(plugin, (scope) => {
        scope.get("/api/things", () => ({}));
      });
      expect(outcome).toBe(BAD);
    });

    it("rejects a route with a different param name, listing every bad route", async () => {
      const outcome = await readyOutcome(plugin, (scope) => {
        scope.get("/api/projects/:id", () => ({}));
        scope.post("/api/other", () => ({}));
      });
      expect(outcome).toContain("/api/projects/:id, /api/other");
    });

    it("rejects a route in a callback child plugin", async () => {
      const outcome = await readyOutcome(plugin, (scope) => {
        void scope.register((child, _options, done) => {
          child.get("/api/things", () => ({}));
          done();
        });
      });
      expect(outcome).toBe(BAD);
    });

    it("rejects a route in an async child plugin", async () => {
      const outcome = await readyOutcome(plugin, (scope) => {
        void scope.register(async (child) => {
          child.get("/api/things", () => ({}));
          await Promise.resolve();
        });
      });
      expect(outcome).toBe(BAD);
    });
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
