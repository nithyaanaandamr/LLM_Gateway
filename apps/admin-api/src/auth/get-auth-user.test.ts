import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { errorHandler } from "../error-handler.ts";
import { getAuthUser } from "./get-auth-user.ts";

describe("getAuthUser", () => {
  it("is a generic 500 in a route outside the protected scope", async () => {
    const app = Fastify({ logger: false });
    app.setErrorHandler(errorHandler);
    app.get("/x", (request) => getAuthUser(request));

    const res = await app.inject("/x");

    expect(res.statusCode).toBe(500);
    expect(res.json<{ error: { code: string } }>().error.code).toBe("INTERNAL");
  });
});
