import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { buildApp, type App } from "./app.ts";
import { AppError } from "./errors.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const config = { port: 0, host: "127.0.0.1", logLevel: "silent" } as const;

let app: App;
afterEach(async () => {
  await app.close();
});

function errorOf(res: { json: () => unknown }) {
  return (res.json() as { error: Record<string, unknown> }).error;
}

describe("health and unknown routes", () => {
  it("GET /health returns ok", async () => {
    app = buildApp(config);
    const res = await app.inject("/health");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });

  it("unknown route gives the 404 error shape", async () => {
    app = buildApp(config);
    const res = await app.inject("/nope");
    expect(res.statusCode).toBe(404);
    expect(errorOf(res)).toMatchObject({ code: "NOT_FOUND", message: "Route not found" });
    expect(errorOf(res).requestId).toMatch(UUID);
  });

  it("wrong method gives the 404 error shape", async () => {
    app = buildApp(config);
    const res = await app.inject({ method: "DELETE", url: "/health" });
    expect(res.statusCode).toBe(404);
    expect(errorOf(res).code).toBe("NOT_FOUND");
  });

  it("gives each request its own requestId", async () => {
    app = buildApp(config);
    const a = errorOf(await app.inject("/x")).requestId;
    const b = errorOf(await app.inject("/x")).requestId;
    expect(a).not.toBe(b);
  });
});

describe("error handling", () => {
  function withRoutes() {
    app = buildApp(config);
    app.post(
      "/items/:id",
      {
        schema: {
          params: z.object({ id: z.uuid() }),
          body: z.object({ name: z.string().min(1) }),
        },
      },
      () => ({ ok: true }),
    );
    app.get("/boom", () => {
      throw new Error("db password=hunter2");
    });
    app.get("/known", () => {
      throw new AppError(409, "CONFLICT", "Already exists");
    });
    app.get(
      "/bad-response",
      { schema: { response: { 200: z.object({ a: z.string() }) } } },
      () => ({ a: 1 }) as unknown as { a: string },
    );
  }
  const goodId = "6f1c1c1e-3c1a-4b8e-9a53-0d6b6a2f7a11";

  it("bad params id gives VALIDATION_FAILED at params.id", async () => {
    withRoutes();
    const res = await app.inject({ method: "POST", url: "/items/nope", payload: { name: "x" } });
    expect(res.statusCode).toBe(400);
    expect(errorOf(res).code).toBe("VALIDATION_FAILED");
    expect((errorOf(res).details as { path: string }[])[0]?.path).toBe("params.id");
  });

  it("empty name gives VALIDATION_FAILED at body.name", async () => {
    withRoutes();
    const res = await app.inject({
      method: "POST",
      url: `/items/${goodId}`,
      payload: { name: "" },
    });
    expect(res.statusCode).toBe(400);
    expect((errorOf(res).details as { path: string }[])[0]?.path).toBe("body.name");
  });

  it("malformed JSON gives BAD_REQUEST", async () => {
    withRoutes();
    const res = await app.inject({
      method: "POST",
      url: `/items/${goodId}`,
      headers: { "content-type": "application/json" },
      payload: "{bad",
    });
    expect(res.statusCode).toBe(400);
    expect(errorOf(res).code).toBe("BAD_REQUEST");
  });

  it("wrong content type gives UNSUPPORTED_MEDIA_TYPE", async () => {
    withRoutes();
    const res = await app.inject({
      method: "POST",
      url: `/items/${goodId}`,
      headers: { "content-type": "text/xml" },
      payload: "<a/>",
    });
    expect(res.statusCode).toBe(415);
    expect(errorOf(res).code).toBe("UNSUPPORTED_MEDIA_TYPE");
  });

  it("thrown Error gives generic 500 with no internals", async () => {
    withRoutes();
    const res = await app.inject("/boom");
    expect(res.statusCode).toBe(500);
    expect(errorOf(res).code).toBe("INTERNAL");
    expect(res.body).not.toContain("hunter2");
    expect(res.body).not.toContain("stack");
    expect(res.body).not.toContain("at ");
  });

  it("AppError keeps its status, code and message", async () => {
    withRoutes();
    const res = await app.inject("/known");
    expect(res.statusCode).toBe(409);
    expect(errorOf(res)).toMatchObject({ code: "CONFLICT", message: "Already exists" });
  });

  it("response schema mismatch gives 500 INTERNAL", async () => {
    withRoutes();
    const res = await app.inject("/bad-response");
    expect(res.statusCode).toBe(500);
    expect(errorOf(res).code).toBe("INTERNAL");
  });
});
