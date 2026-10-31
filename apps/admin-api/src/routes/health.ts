import type { FastifyPluginCallbackZod } from "fastify-type-provider-zod";
import { z } from "zod";

const healthResponse = z.object({ status: z.literal("ok") });

// Liveness only. Readiness (GET /ready, checks the DB) is added with the first DB-backed task.
export const healthRoutes: FastifyPluginCallbackZod = (app, _options, done) => {
  app.get(
    "/health",
    {
      logLevel: "warn", // keeps frequent probe requests out of the logs
      schema: { response: { 200: healthResponse } },
    },
    () => ({ status: "ok" as const }),
  );
  done();
};
