import type { FastifyInstance } from "fastify";

const SIGNALS = ["SIGTERM", "SIGINT"] as const;

// see PITFALLS.md: Graceful shutdown
export function closeOnSignals(app: FastifyInstance): void {
  for (const signal of SIGNALS) {
    process.once(signal, () => {
      void shutDown(app, signal);
    });
  }
}

async function shutDown(app: FastifyInstance, signal: NodeJS.Signals): Promise<void> {
  app.log.info({ signal }, "shutting down");
  try {
    await app.close();
    app.log.info("closed");
  } catch (err) {
    app.log.error({ err }, "error during shutdown");
    process.exitCode = 1;
  }
}
