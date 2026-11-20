// Test-only (excluded from the build). Never import from app code.
import type { LightMyRequestResponse } from "fastify";
import type { App } from "../app.ts";
import type { Config } from "../config.ts";
import { headersFor, uniqueIp } from "./auth-requests.ts";

export interface ApiRequest {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  url: string;
  cookie?: string;
  // Any JSON value, sent as a JSON body. Loosely typed on purpose: tests send arrays,
  // null, numbers, wrong types and unknown keys
  payload?: unknown;
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
    ...(request.payload === undefined ? {} : { payload: JSON.stringify(request.payload) }),
    remoteAddress: uniqueIp(),
    headers: headersFor(config, {
      ...(request.cookie === undefined ? {} : { cookie: request.cookie }),
      ...(request.payload === undefined ? {} : { headers: { "content-type": "application/json" } }),
      ...(request.origin === undefined ? {} : { origin: request.origin }),
    }),
  });
}
