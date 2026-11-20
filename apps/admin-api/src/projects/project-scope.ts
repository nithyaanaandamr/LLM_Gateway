import type { Database } from "@gw/db";
import type { FastifyInstance, RouteOptions } from "fastify";
import { requireProject } from "./require-project.ts";

const HAS_PROJECT_ID = /\/:projectId(\/|$)/;

// Adds the project check to the plugin scope it is called in. Call it before registering routes:
// the guard and the hook only cover routes added after it. Needs the protected scope's session
// hook to run first (the check needs the user), which holds when this scope is inside it.
export function projectScope(scope: FastifyInstance, { db }: { db: Database }): void {
  scope.decorateRequest("project", null);
  scope.addHook("onRequest", requireProject(db));
  guardRoutes(scope);
}

// A route without :projectId would skip the lookup's meaning, so it must not ship.
// onRoute only records it: a throw there, inside a callback-style plugin, is an uncaught
// exception and ready() never settles. The onReady hook throws, so ready() rejects.
// see PITFALLS.md: Fastify onRoute errors in callback plugins are uncaught
function guardRoutes(scope: FastifyInstance): void {
  const misplaced = new Set<string>(); // a Set: Fastify adds a HEAD route for each GET
  scope.addHook("onRoute", (options: RouteOptions) => {
    if (!HAS_PROJECT_ID.test(options.url)) misplaced.add(options.url);
  });
  scope.addHook("onReady", () => {
    if (misplaced.size > 0) {
      throw new Error(
        `Routes in the project scope must have :projectId in the path: ${[...misplaced].join(", ")}`,
      );
    }
  });
}
