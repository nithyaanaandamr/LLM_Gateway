import type { Auth } from "@gw/auth";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { FastifyPluginCallbackZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { toAuthError } from "./auth-error.ts";
import { sendWebResponse } from "./send-web-response.ts";
import { toWebRequest } from "./to-web-request.ts";

export interface AuthRoutesOptions {
  auth: Auth;
  baseUrl: string;
}

// Unknown keys are rejected on every body and query: Better Auth would accept extras
// (image, callbackURL, ...) and we re-serialize exactly what passed our check.
// Password length rules stay in Better Auth (min and max in createAuth).
const emailField = z.email().max(254);
const signUpBody = z.strictObject({
  name: z.string().trim().min(1).max(100),
  email: emailField,
  password: z.string(),
});
const signInBody = z.strictObject({ email: emailField, password: z.string() });
// A client may send no body at all, or a JSON null
const signOutBody = z.strictObject({}).nullish();
const noQuery = z.strictObject({});

// Sends the request through Better Auth (origin check, rate limit, password check all run there)
function forwardTo({ auth, baseUrl }: AuthRoutesOptions) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const response = await auth.handler(toWebRequest(request, baseUrl));
    if (response.status >= 400) {
      copyRetryAfter(response, reply);
      throw await toAuthError(response);
    }
    return sendWebResponse(reply, response);
  };
}

// Better Auth sends X-Retry-After (seconds) on a 429; the standard name is Retry-After.
// The header set here survives the error handler.
function copyRetryAfter(response: Response, reply: FastifyReply): void {
  const seconds = response.headers.get("x-retry-after");
  if (response.status === 429 && seconds !== null) reply.header("retry-after", seconds);
}

// Only the endpoints we use are exposed; every other /api/auth/* path is a 404
export const authRoutes: FastifyPluginCallbackZod<AuthRoutesOptions> = (app, options, done) => {
  const forward = forwardTo(options);
  app.post("/api/auth/sign-up/email", { schema: { body: signUpBody } }, forward);
  app.post("/api/auth/sign-in/email", { schema: { body: signInBody } }, forward);
  app.post("/api/auth/sign-out", { schema: { body: signOutBody } }, forward);
  app.get("/api/auth/get-session", { schema: { querystring: noQuery } }, forward);
  done();
};
