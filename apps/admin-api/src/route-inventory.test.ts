import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { App } from "./app.ts";
import type { Config } from "./config.ts";
import { buildAppAndCollectRoutes, type Route } from "./testing/route-collector.ts";
import { testConfig } from "./testing/test-config.ts";

// Locked by default: every route buildApp registers must require a session, except these.
// A new public route must be added here on purpose, in the same PR that adds the route.
const PUBLIC_ROUTES = [
  "GET /health",
  "POST /api/auth/sign-up/email",
  "POST /api/auth/sign-in/email",
  "POST /api/auth/sign-out",
  "GET /api/auth/get-session",
];

const DUMMY_UUID = "6f1c1c1e-3c1a-4b8e-9a53-0d6b6a2f7a11";

const key = (route: Route) => `${route.method} ${route.url}`;

// ":id" -> a UUID, "*" -> a word, so a route like /api/projects/:id can be requested as is
function concretePath(url: string): string {
  return url.replace(/:[A-Za-z0-9_]+/g, DUMMY_UUID).replace(/\*/g, "x");
}

function errorCode(body: string): string {
  try {
    return (JSON.parse(body) as { error: { code: string } }).error.code;
  } catch {
    return "(no error body)";
  }
}

describe("route inventory: locked by default", () => {
  let config: Config;
  let app: App;
  let routes: Route[];

  beforeAll(async () => {
    config = await testConfig();
    ({ app, routes } = buildAppAndCollectRoutes(config));
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  // Fastify adds a HEAD route for each GET route; it is public only if its GET is
  const isPublic = (route: Route) =>
    PUBLIC_ROUTES.includes(key(route.method === "HEAD" ? { ...route, method: "GET" } : route));

  it("finds the routes (the hook is not silently missing them)", () => {
    expect(routes.length).toBeGreaterThan(PUBLIC_ROUTES.length);
  });

  it("every public route in the allowlist exists (no stale entries)", () => {
    const registered = new Set(routes.map(key));
    expect(PUBLIC_ROUTES.filter((entry) => !registered.has(entry))).toEqual([]);
  });

  it("checks at least GET /api/me as a protected route", () => {
    const protectedRoutes = routes.filter((route) => !isPublic(route)).map(key);
    expect(protectedRoutes).toContain("GET /api/me");
  });

  it("every other route answers 401 UNAUTHORIZED with no cookie, even with a trusted Origin", async () => {
    const protectedRoutes = routes.filter((route) => !isPublic(route));
    const failures: string[] = [];
    for (const route of protectedRoutes) {
      const res = await app.inject({
        method: route.method as "GET",
        url: concretePath(route.url),
        headers: { origin: config.dashboardOrigin },
      });
      // A HEAD response has no body to read the code from
      const isHead = route.method === "HEAD";
      const code = isHead ? "UNAUTHORIZED" : errorCode(res.body);
      if (res.statusCode !== 401 || code !== "UNAUTHORIZED") {
        failures.push(`${key(route)} answered ${res.statusCode}${isHead ? "" : ` ${code}`}`);
      }
    }
    expect(failures).toEqual([]);
  });
});
