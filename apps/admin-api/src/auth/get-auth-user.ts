import type { AuthSession } from "@gw/auth";
import type { FastifyRequest } from "fastify";

// The logged-in user. Only valid in a route inside the protected scope (protected-api.ts).
export function getAuthUser(request: FastifyRequest): AuthSession["user"] {
  // also true when the request was never decorated (route outside the protected scope)
  if (!request.auth) {
    // A programming error (route outside the protected scope), not a client error: becomes a logged 500
    throw new Error("getAuthUser called outside the protected scope");
  }
  return request.auth.user;
}
