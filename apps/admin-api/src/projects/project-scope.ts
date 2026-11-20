import type { Database } from "@gw/db";
import type { FastifyInstance, RouteOptions } from "fastify";
import { requireProject } from "./require-project.ts";

const HAS_PROJECT_ID = /\/:projectId(\/|$)/;

// Throws while the route is being registered, so a misplaced route stops app.ready()
function requireProjectIdInPath(options: RouteOptions): void {
  if (!HAS_PROJECT_ID.test(options.url)) {
    throw new Error(`Route ${options.url} is in the project scope but has no :projectId`);
  }
}

// Adds the project check to the plugin scope it is called in. Call it before registering routes:
// the guard and the hook only cover routes added after it. Needs the protected scope's session
// hook to run first (the check needs the user), which holds when this scope is inside it.
export function projectScope(scope: FastifyInstance, { db }: { db: Database }): void {
  scope.decorateRequest("project", null);
  scope.addHook("onRoute", requireProjectIdInPath);
  scope.addHook("onRequest", requireProject(db));
}
