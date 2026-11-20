import type { FastifyReply, FastifyRequest, HookHandlerDoneFunction } from "fastify";
import { AppError } from "../errors.ts";

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// onRequest hook: a request that can change data must come from a trusted origin.
// Better Auth checks only its own routes; this covers ours.
// see PITFALLS.md: Better Auth's origin check covers only its own routes
export function requireTrustedOrigin(trustedOrigins: string[]) {
  // Callback style: a plain (non-async) Fastify hook must call done
  return (request: FastifyRequest, _reply: FastifyReply, done: HookHandlerDoneFunction): void => {
    if (!UNSAFE_METHODS.has(request.method)) return done();
    const origin = request.headers.origin;
    if (origin === undefined || !trustedOrigins.includes(origin)) {
      return done(new AppError(403, "FORBIDDEN", "Origin not allowed"));
    }
    done();
  };
}
