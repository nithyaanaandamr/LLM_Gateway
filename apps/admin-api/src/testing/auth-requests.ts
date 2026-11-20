// Test-only (excluded from the build). Never import from app code.
import type { LightMyRequestResponse } from "fastify";
import type { App } from "../app.ts";
import type { Config } from "../config.ts";

export const TEST_PASSWORD = "correct-horse-battery";

// Every request gets its own client IP unless a test sets one: the auth rate limit is
// per IP and its memory store is shared by every app in the test file.
// see PITFALLS.md: Auth rate limit needs the real client IP
let nextIp = 1;
export function uniqueIp(): string {
  const n = nextIp++;
  return `10.2.${Math.floor(n / 250)}.${(n % 250) + 1}`;
}

export interface RequestOptions {
  remoteAddress?: string;
  // undefined: send the dashboard origin; null: send no Origin header
  origin?: string | null;
  cookie?: string;
  // headers a test adds on top, e.g. a spoofed client IP header
  headers?: Record<string, string>;
}

function headersFor(config: Config, options: RequestOptions): Record<string, string> {
  const headers: Record<string, string> = { ...options.headers };
  const origin = options.origin === undefined ? config.dashboardOrigin : options.origin;
  if (origin !== null) headers["origin"] = origin;
  if (options.cookie) headers["cookie"] = options.cookie;
  return headers;
}

function postJson(
  app: App,
  config: Config,
  url: string,
  payload: unknown,
  options: RequestOptions,
): Promise<LightMyRequestResponse> {
  return app.inject({
    method: "POST",
    url,
    payload: payload as object,
    remoteAddress: options.remoteAddress ?? uniqueIp(),
    headers: headersFor(config, options),
  });
}

// Bodies are loosely typed on purpose: tests send wrong types and unknown keys
type Body = Record<string, unknown>;

export function signUp(app: App, config: Config, body: Body, options: RequestOptions = {}) {
  return postJson(app, config, "/api/auth/sign-up/email", body, options);
}

export function signIn(app: App, config: Config, body: Body, options: RequestOptions = {}) {
  return postJson(app, config, "/api/auth/sign-in/email", body, options);
}

export function signOut(app: App, config: Config, options: RequestOptions = {}) {
  return postJson(app, config, "/api/auth/sign-out", {}, options);
}

export function getSession(app: App, config: Config, options: RequestOptions = {}) {
  return app.inject({
    method: "GET",
    url: "/api/auth/get-session",
    remoteAddress: options.remoteAddress ?? uniqueIp(),
    headers: headersFor(config, options),
  });
}

const SESSION_COOKIE = /^(__Secure-)?better-auth\.session_token=/;

// "name=value" of the session cookie, ready to send back as a Cookie header.
// Picked by name (not position); the name gets a __Secure- prefix on https.
export function cookieFrom(response: LightMyRequestResponse): string {
  const setCookie = response.headers["set-cookie"];
  const all = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const session = all.find((value) => SESSION_COOKIE.test(value));
  if (!session) throw new Error("response has no session cookie");
  return session.split(";")[0] ?? "";
}
