import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { errorHandler } from "../error-handler.ts";
import { requireTrustedOrigin } from "./require-trusted-origin.ts";

const TRUSTED = "http://localhost:5173";
const UNSAFE = ["POST", "PUT", "PATCH", "DELETE"] as const;

describe("requireTrustedOrigin", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    app.setErrorHandler(errorHandler);
    void app.register((scope, _options, done) => {
      scope.addHook("onRequest", requireTrustedOrigin([TRUSTED, "https://admin.example.com"]));
      scope.get("/x", () => ({ ok: true }));
      scope.post("/x", () => ({ ok: true }));
      scope.put("/x", () => ({ ok: true }));
      scope.patch("/x", () => ({ ok: true }));
      scope.delete("/x", () => ({ ok: true }));
      done();
    });
    await app.ready();
  });

  afterAll(() => app.close());

  const call = (method: string, origin?: string) =>
    app.inject({
      method: method as "GET",
      url: "/x",
      ...(origin === undefined ? {} : { headers: { origin } }),
    });

  it.each(UNSAFE)("%s from a trusted Origin passes", async (method) => {
    expect((await call(method, TRUSTED)).statusCode).toBe(200);
    expect((await call(method, "https://admin.example.com")).statusCode).toBe(200);
  });

  it.each(UNSAFE)("%s with no Origin is 403 FORBIDDEN in our shape", async (method) => {
    const res = await call(method);
    expect(res.statusCode).toBe(403);
    expect(res.json<{ error: { code: string } }>().error.code).toBe("FORBIDDEN");
  });

  it.each(UNSAFE)("%s from another Origin is 403", async (method) => {
    for (const origin of [
      "https://evil.example",
      "null",
      "http://localhost:5174",
      "http://localhost:5173.evil.example",
      "http://localhost:5173/",
      "",
    ]) {
      expect((await call(method, origin)).statusCode).toBe(403);
    }
  });

  it("lets a GET through with no Origin and with a foreign Origin", async () => {
    expect((await call("GET")).statusCode).toBe(200);
    expect((await call("GET", "https://evil.example")).statusCode).toBe(200);
  });
});
