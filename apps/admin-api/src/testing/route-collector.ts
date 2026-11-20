// Test-only (excluded from the build). Never import from app code.
import diagnostics from "node:diagnostics_channel";
import type { FastifyInstance, RouteOptions } from "fastify";
import { buildApp, type App } from "../app.ts";
import type { Config } from "../config.ts";

export interface Route {
  method: string;
  url: string; // as registered, e.g. /api/projects/:projectId
}

// buildApp registers some routes itself, before it returns, so an onRoute hook added afterwards
// would miss them. Fastify announces each new instance on this channel, before any route exists:
// we add the hook there. Routes in plugins are seen too (child plugins inherit the hook).
export function buildAppAndCollectRoutes(config: Config): { app: App; routes: Route[] } {
  const routes: Route[] = [];
  const onNewInstance = (message: unknown) => {
    const { fastify } = message as { fastify: FastifyInstance };
    fastify.addHook("onRoute", (options: RouteOptions) => {
      for (const method of [options.method].flat()) routes.push({ method, url: options.url });
    });
  };
  diagnostics.subscribe("fastify.initialization", onNewInstance);
  try {
    return { app: buildApp(config), routes };
  } finally {
    diagnostics.unsubscribe("fastify.initialization", onNewInstance);
  }
}
