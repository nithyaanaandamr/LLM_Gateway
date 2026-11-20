import { CLIENT_IP_HEADER, fromNodeHeaders } from "@gw/auth";
import type { FastifyRequest } from "fastify";

type IncomingRequest = Pick<FastifyRequest, "method" | "url" | "headers" | "body" | "ip">;

// Fastify request -> web Request for auth.handler.
// The URL comes from the configured origin, never the Host header. `baseUrl` is origin-only (see config.ts).
export function toWebRequest(request: IncomingRequest, baseUrl: string): Request {
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
  if (request.method === "GET" || request.method === "HEAD") return null;
  if (request.body === undefined) return null;
  return JSON.stringify(request.body);
}
