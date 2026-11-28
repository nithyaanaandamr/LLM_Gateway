import type { Auth } from "@gw/auth";
import type { Database } from "@gw/db";
import type { MasterKey } from "@gw/shared/crypto";
import type { FastifyInstance } from "fastify";
import type { FastifyPluginCallbackZod } from "fastify-type-provider-zod";
import { requireSession } from "./auth/require-session.ts";
import { requireTrustedOrigin } from "./auth/require-trusted-origin.ts";
import { projectCollectionRoutes } from "./projects/project-collection-routes.ts";
import { projectScopedApi } from "./projects/project-scoped-api.ts";
import { meRoutes } from "./routes/me-routes.ts";

export interface ProtectedApiOptions {
  auth: Auth;
  trustedOrigins: string[];
  db: Database;
  masterKey: MasterKey;
}

// Adds the checks to the plugin scope it is called in. Order matters: the Origin check is
// cheap and needs no database, so a forged cross-site request is rejected before the session lookup.
export function protectScope(
  scope: FastifyInstance,
  { auth, trustedOrigins }: Pick<ProtectedApiOptions, "auth" | "trustedOrigins">,
) {
  scope.decorateRequest("auth", null);
  scope.addHook("onRequest", requireTrustedOrigin(trustedOrigins));
  scope.addHook("onRequest", requireSession(auth));
}

// Every route registered here needs a trusted Origin (unsafe methods) and a logged-in user.
// GW-018 onward register their routes inside this plugin and call getAuthUser(request).
export const protectedApi: FastifyPluginCallbackZod<ProtectedApiOptions> = (app, options, done) => {
  protectScope(app, options);
  void app.register(meRoutes);
  void app.register(projectCollectionRoutes, { db: options.db });
  void app.register(projectScopedApi, { db: options.db, masterKey: options.masterKey });
  done();
};
