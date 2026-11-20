import { fromNodeHeaders, type Auth, type AuthSession } from "@gw/auth";
import type { FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "../errors.ts";

declare module "fastify" {
  interface FastifyRequest {
    // Set by requireSession. Only the protected scope declares it (null until the hook
    // runs); outside that scope the property does not exist, so it reads as undefined.
    auth?: AuthSession | null;
  }
}

// onRequest hook: the request must carry a valid session cookie. Only the cookie is read:
// gateway keys (Authorization: Bearer) are never accepted on the admin API.
export function requireSession(auth: Auth) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const { headers, response } = await auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
      returnHeaders: true,
    });
    // Always copy: a refreshed session sends a new cookie, an expired one a clearing cookie
    // see PITFALLS.md: Session refresh needs its Set-Cookie forwarded
    const cookies = headers.getSetCookie();
    if (cookies.length > 0) reply.header("set-cookie", cookies);
    if (response === null) throw new AppError(401, "UNAUTHORIZED", "Not logged in");
    request.auth = response;
  };
}
