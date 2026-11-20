import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { App } from "./app.ts";
import type { Config } from "./config.ts";
import { apiRequest, type ApiRequest } from "./testing/api-requests.ts";
import { signUpUser } from "./testing/auth-requests.ts";
import { createProject, type ProjectJson } from "./testing/project-requests.ts";
import { buildAppAndCollectRoutes, type Route } from "./testing/route-collector.ts";
import { testConfig } from "./testing/test-config.ts";

// The authorization version of route-inventory.test.ts: every route with :projectId, called by
// a user who does not own the project, must answer exactly like a project that does not exist.
// New project routes (provider key, gateway keys) are covered with no edits here.
const DUMMY_UUID = "6f1c1c1e-3c1a-4b8e-9a53-0d6b6a2f7a11";

type Method = ApiRequest["method"];
type Answer = { status: number; body: unknown };

const label = (route: Route) => `${route.method} ${route.url}`;

// :projectId gets the given ID, any other :param a dummy UUID, "*" a word
function urlFor(route: Route, projectId: string): string {
  return route.url
    .replace(/:projectId\b/g, projectId)
    .replace(/:[A-Za-z0-9_]+/g, DUMMY_UUID)
    .replace(/\*/g, "x");
}

// The body with the per-request ID removed, so two answers can be compared
function withoutRequestId(text: string): unknown {
  if (text === "") return null; // HEAD has no body
  const parsed = JSON.parse(text) as { error?: Record<string, unknown> };
  if (!parsed.error) return parsed; // not an error body: shown as is in the failure message
  const error = { ...parsed.error };
  delete error["requestId"];
  return { error };
}

describe("project ownership: every :projectId route", () => {
  let config: Config;
  let app: App;
  let routes: Route[];
  let projectRoutes: Route[];

  beforeAll(async () => {
    config = await testConfig();
    ({ app, routes } = buildAppAndCollectRoutes(config));
    await app.ready();
    projectRoutes = routes.filter((route) => /\/:projectId(\/|$)/.test(route.url));
  });

  afterAll(() => app.close());

  async function answer(cookie: string, route: Route, projectId: string): Promise<Answer> {
    const res = await apiRequest(app, config, {
      method: route.method as Method,
      url: urlFor(route, projectId),
      cookie,
    });
    return { status: res.statusCode, body: withoutRequestId(res.body) };
  }

  it("finds at least the three project item routes (the collector is not silently empty)", () => {
    const found = projectRoutes.map(label);
    expect(found).toEqual(
      expect.arrayContaining([
        "GET /api/projects/:projectId",
        "PATCH /api/projects/:projectId",
        "DELETE /api/projects/:projectId",
      ]),
    );
  });

  it("finds no route with :projectId elsewhere that this filter would miss", () => {
    const loose = routes.filter((route) => route.url.includes("projectId"));
    expect(loose.map(label).sort()).toEqual(projectRoutes.map(label).sort());
  });

  it("answers 404 NOT_FOUND 'Project not found' to another user, like a random UUID, and changes nothing", async () => {
    const [owner, intruder] = [await signUpUser(app, config), await signUpUser(app, config)];
    const project = await createProject(app, config, owner.cookie, "keep-me");
    const readProject = async () =>
      (
        await apiRequest(app, config, {
          method: "GET",
          url: `/api/projects/${project.id}`,
          cookie: owner.cookie,
        })
      ).json<ProjectJson>();
    const before = await readProject();
    const failures: string[] = [];

    for (const route of projectRoutes) {
      const theirs = await answer(intruder.cookie, route, project.id);
      const missing = await answer(intruder.cookie, route, randomUUID());
      const isHead = route.method === "HEAD";
      const expected = isHead
        ? null
        : { error: { code: "NOT_FOUND", message: "Project not found" } };
      const ok =
        theirs.status === 404 &&
        JSON.stringify(theirs.body) === JSON.stringify(expected) &&
        JSON.stringify(theirs) === JSON.stringify(missing);
      if (!ok)
        failures.push(`${label(route)} answered ${theirs.status} ${JSON.stringify(theirs.body)}`);
    }

    expect(failures).toEqual([]);
    expect(await readProject()).toEqual(before);
    const list = await apiRequest(app, config, {
      method: "GET",
      url: "/api/projects",
      cookie: owner.cookie,
    });
    expect(list.json<{ projects: ProjectJson[] }>().projects).toEqual([before]);
  });
});
