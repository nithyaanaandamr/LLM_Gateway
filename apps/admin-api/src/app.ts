import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import type { Config } from "./config.ts";
import { errorHandler, frameworkErrorHandler, notFoundHandler } from "./error-handler.ts";
import { loggerOptions } from "./logger.ts";
import { healthRoutes } from "./routes/health.ts";

export function buildApp(config: Config) {
  const app = Fastify({
    logger: loggerOptions(config),
    // unique across restarts and instances; client x-request-id is not trusted
    genReqId: () => randomUUID(),
    frameworkErrors: frameworkErrorHandler,
  }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler(notFoundHandler);
  closeConnectionsAfterResponseOnShutdown(app);
  // `void`: plugins load later, on ready()/listen()/inject()
  void app.register(healthRoutes);
  return app;
}

// see PITFALLS.md: Graceful shutdown
function closeConnectionsAfterResponseOnShutdown(app: FastifyInstance): void {
  let closing = false;
  app.addHook("preClose", () => {
    closing = true;
  });
  app.addHook("onSend", (_request, reply, payload, done) => {
    if (closing) reply.header("connection", "close");
    done(null, payload);
  });
}

export type App = ReturnType<typeof buildApp>;
