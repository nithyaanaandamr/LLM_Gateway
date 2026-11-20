import { CLIENT_IP_HEADER, fromNodeHeaders } from "@gw/auth";
import type { FastifyRequest } from "fastify";
import { AppError } from "../errors.ts";

type IncomingRequest = Pick<FastifyRequest, "method" | "url" | "headers" | "body" | "ip">;

// Fastify request -> web Request for auth.handler.
// The URL comes from the configured origin, never the Host header. `baseUrl` is origin-only (see config.ts).
export function toWebRequest(request: IncomingRequest, baseUrl: string): Request {
  // An absolute-form request line (GET http://host/path) keeps the full URL here; joining it breaks
  if (!request.url.startsWith("/")) {
    throw new AppError(400, "BAD_REQUEST", "Request URL must be a path");
  }
  return new Request(`${baseUrl}${request.url}`, {
    method: request.method,
    headers: webHeaders(request),
    body: webBody(request),
  });
}

function webHeaders(request: IncomingRequest): Headers {
  const headers = fromNodeHeaders(request.headers);
  // The body is re-serialized below, so the client's length would be wrong
  headers.delete("content-length");
  // set() replaces any value the client sent: only the real connection IP counts
  // see PITFALLS.md: Auth rate limit needs the real client IP
  headers.set(CLIENT_IP_HEADER, request.ip);
  return headers;
}

// Fastify already parsed the JSON; Better Auth reads a fresh stream
// see PITFALLS.md: Auth requests are parsed twice
function webBody(request: IncomingRequest): string | null {
  // new Request throws on a GET or HEAD with a body
  if (request.method === "GET" || request.method === "HEAD") return null;
  // no body, or a JSON null: nothing to forward
  if (request.body === undefined || request.body === null) return null;
  return JSON.stringify(request.body);
}
