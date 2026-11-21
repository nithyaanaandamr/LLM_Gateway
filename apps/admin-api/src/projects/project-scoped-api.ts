import type { Database } from "@gw/db";
import type { MasterKey } from "@gw/shared/crypto";
import type { FastifyPluginCallbackZod } from "fastify-type-provider-zod";
import { gatewayKeyRoutes } from "../gateway-keys/gateway-key-routes.ts";
import { projectItemRoutes } from "./project-item-routes.ts";
import { projectScope } from "./project-scope.ts";
import { providerKeyRoutes } from "../provider-keys/provider-key-routes.ts";

export interface ProjectScopedApiOptions {
  db: Database;
  masterKey: MasterKey;
}

// Every route here has :projectId in its path; the scope hook checks access once.
export const projectScopedApi: FastifyPluginCallbackZod<ProjectScopedApiOptions> = (
  app,
  options,
  done,
) => {
  projectScope(app, { db: options.db });
  void app.register(gatewayKeyRoutes, { db: options.db });
  void app.register(projectItemRoutes, { db: options.db });
  void app.register(providerKeyRoutes, { db: options.db, masterKey: options.masterKey });
  done();
};
