import { listGatewayKeys, revokeGatewayKey, type Database } from "@gw/db";
import type { FastifyPluginCallbackZod } from "fastify-type-provider-zod";
import { AppError } from "../errors.ts";
import { getProject } from "../projects/get-project.ts";
import {
  gatewayKeyBody,
  gatewayKeyListResponse,
  gatewayKeyParams,
  issueGatewayKeyResponse,
  toGatewayKeyResponse,
} from "./gateway-key-schemas.ts";
import { issueGatewayKey } from "./issue-gateway-key.ts";

export interface GatewayKeyRoutesOptions {
  db: Database;
}

// Registered inside the project scope: getProject(request) is the checked project.
// Every query uses its id (from the database), never the URL's projectId.
export const gatewayKeyRoutes: FastifyPluginCallbackZod<GatewayKeyRoutesOptions> = (
  app,
  { db },
  done,
) => {
  app.get(
    "/api/projects/:projectId/gateway-keys",
    { schema: { response: { 200: gatewayKeyListResponse } } },
    async (request) => {
      const keys = await listGatewayKeys(db, getProject(request).id);
      return { gatewayKeys: keys.map(toGatewayKeyResponse) };
    },
  );

  app.post(
    "/api/projects/:projectId/gateway-keys",
    { schema: { body: gatewayKeyBody, response: { 201: issueGatewayKeyResponse } } },
    async (request, reply) => {
      const { key, gatewayKey } = await issueGatewayKey(
        db,
        getProject(request).id,
        request.body.name,
      );
      return reply.code(201).send({ key, gatewayKey: toGatewayKeyResponse(gatewayKey) });
    },
  );

  // Revoke: keeps the row, sets revoked_at. 204 also when already revoked (same answer each time).
  // see PITFALLS.md: Find child rows through their project
  app.delete(
    "/api/projects/:projectId/gateway-keys/:keyId",
    { schema: { params: gatewayKeyParams } },
    async (request, reply) => {
      const revoked = await revokeGatewayKey(db, getProject(request).id, request.params.keyId);
      if (!revoked) throw new AppError(404, "NOT_FOUND", "Gateway key not found");
      return reply.code(204).send();
    },
  );
  done();
};
