import type { Database } from "@gw/db";
import type { FastifyPluginCallbackZod } from "fastify-type-provider-zod";
import { projectItemRoutes } from "./project-item-routes.ts";
import { projectScope } from "./project-scope.ts";

export interface ProjectScopedApiOptions {
  db: Database;
}

// Every route here has :projectId in its path; the scope hook checks access once.
export const projectScopedApi: FastifyPluginCallbackZod<ProjectScopedApiOptions> = (
  app,
  options,
  done,
) => {
  projectScope(app, { db: options.db });
  void app.register(projectItemRoutes, { db: options.db });
  done();
};
