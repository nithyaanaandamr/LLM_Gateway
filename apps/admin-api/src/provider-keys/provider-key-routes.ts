import { deleteProviderKey, findProviderKeySummary, type Database } from "@gw/db";
import type { MasterKey } from "@gw/shared/crypto";
import type { FastifyPluginCallbackZod } from "fastify-type-provider-zod";
import { AppError } from "../errors.ts";
import { getProject } from "../projects/get-project.ts";
import {
  providerKeyBody,
  providerKeyResponse,
  toProviderKeyResponse,
} from "./provider-key-schemas.ts";
import { storeProviderKey } from "./store-provider-key.ts";

export interface ProviderKeyRoutesOptions {
  db: Database;
  masterKey: MasterKey;
}

const PATH = "/api/projects/:projectId/provider-key";

const noProviderKey = () => new AppError(404, "NOT_FOUND", "No provider key set");

// The admin API never decrypts: GET returns the stored summary only.
// see PITFALLS.md: The admin API never reads a provider key back
export const providerKeyRoutes: FastifyPluginCallbackZod<ProviderKeyRoutesOptions> = (
  app,
  { db, masterKey },
  done,
) => {
  app.get(PATH, { schema: { response: { 200: providerKeyResponse } } }, async (request) => {
    const summary = await findProviderKeySummary(db, getProject(request).id);
    if (!summary) throw noProviderKey();
    return toProviderKeyResponse(summary);
  });

  app.put(
    PATH,
    { schema: { body: providerKeyBody, response: { 200: providerKeyResponse } } },
    async (request) => {
      const summary = await storeProviderKey(db, masterKey, getProject(request), request.body);
      return toProviderKeyResponse(summary);
    },
  );

  app.delete(PATH, async (request, reply) => {
    if (!(await deleteProviderKey(db, getProject(request).id))) throw noProviderKey();
    return reply.code(204).send();
  });
  done();
};
