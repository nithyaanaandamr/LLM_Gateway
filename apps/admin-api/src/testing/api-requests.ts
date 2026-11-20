// Test-only (excluded from the build). Never import from app code.
import type { LightMyRequestResponse } from "fastify";
import type { App } from "../app.ts";
import type { Config } from "../config.ts";
import { headersFor, uniqueIp } from "./auth-requests.ts";

export interface ApiRequest {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  url: string;
  cookie?: string;
  // Loosely typed on purpose: tests send wrong types and unknown keys
  payload?: Record<string, unknown>;
  // undefined: send the dashboard origin; null: send no Origin header
  origin?: string | null;
}

// One request to any route, with a unique client IP and the dashboard Origin by default
export function apiRequest(
  app: App,
  config: Config,
  request: ApiRequest,
): Promise<LightMyRequestResponse> {
  return app.inject({
    method: request.method,
    url: request.url,
    ...(request.payload === undefined ? {} : { payload: request.payload }),
    remoteAddress: uniqueIp(),
    headers: headersFor(config, {
      ...(request.cookie === undefined ? {} : { cookie: request.cookie }),
      ...(request.origin === undefined ? {} : { origin: request.origin }),
    }),
  });
}
