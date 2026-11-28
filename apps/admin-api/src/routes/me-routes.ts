import type { FastifyPluginCallbackZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { getAuthUser } from "../auth/get-auth-user.ts";

// Only these fields leave the API; the serializer drops the rest of the user row
const meResponse = z.object({ id: z.string(), email: z.string(), name: z.string() });

export const meRoutes: FastifyPluginCallbackZod = (app, _options, done) => {
  app.get("/api/me", { schema: { response: { 200: meResponse } } }, (request) => {
    const { id, email, name } = getAuthUser(request);
    return { id, email, name };
  });
  done();
};
