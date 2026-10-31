import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { buildApp, type App } from "./app.ts";

const config = { port: 0, host: "127.0.0.1", logLevel: "silent" } as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

let app: App;
afterEach(async () => {
  await app.close();
});

type Err = { code: string; message: string; requestId: string; details?: { path: string }[] };
const errorOf = (res: { json: () => unknown }) => (res.json() as { error: Err }).error;

function withRoutes() {
  app = buildApp(config);
  app.get("/q", { schema: { querystring: z.object({ n: z.coerce.number().int() }) } }, () => ({}));
  app.post("/b", { schema: { body: z.object({ name: z.string() }) } }, () => ({}));
  app.get("/str", () => {
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- testing non-Error throws
    throw "secret-string";
  });
  app.get("/nul", () => {
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- testing non-Error throws
    throw null;
  });
  app.get("/e503", () => {
    throw Object.assign(new Error("db down at /srv/x.ts"), { statusCode: 503 });
  });
}

describe("error shape: more cases", () => {
  it("invalid querystring gives VALIDATION_FAILED at querystring.n", async () => {
    withRoutes();
    const res = await app.inject("/q?n=abc");
    expect(res.statusCode).toBe(400);
    expect(errorOf(res).details?.[0]?.path).toBe("querystring.n");
  });

  it("body missing entirely gives VALIDATION_FAILED at body", async () => {
    withRoutes();
    const res = await app.inject({ method: "POST", url: "/b" });
    expect(res.statusCode).toBe(400);
    expect(errorOf(res).code).toBe("VALIDATION_FAILED");
    expect(errorOf(res).details?.[0]?.path).toBe("body");
  });

  it("body over 1 MB gives 413 PAYLOAD_TOO_LARGE", async () => {
    withRoutes();
    const res = await app.inject({
      method: "POST",
      url: "/b",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ name: "x".repeat(1_100_000) }),
    });
    expect(res.statusCode).toBe(413);
    expect(errorOf(res).code).toBe("PAYLOAD_TOO_LARGE");
  });

  it.each(["/str", "/nul", "/e503"])("%s gives generic 500 INTERNAL", async (url) => {
    withRoutes();
    const res = await app.inject(url);
    expect(res.statusCode).toBe(500);
    expect(errorOf(res)).toMatchObject({ code: "INTERNAL", message: "Internal server error" });
    expect(res.body).not.toMatch(/secret|down|\.ts/);
  });

  it("ignores a client-sent x-request-id", async () => {
    withRoutes();
    const res = await app.inject({ url: "/nope", headers: { "x-request-id": "evil" } });
    expect(errorOf(res).requestId).toMatch(UUID);
  });

  it("health response has only { status }, also with HEAD", async () => {
    withRoutes();
    expect((await app.inject("/health")).json()).toStrictEqual({ status: "ok" });
    expect((await app.inject({ method: "HEAD", url: "/health" })).statusCode).toBe(200);
  });

  // Fastify answers a bad URL itself unless frameworkErrors routes it to our handler
  it("invalid URL (/%) uses the one error shape", async () => {
    withRoutes();
    const res = await app.inject("/%");
    expect(res.statusCode).toBe(400);
    expect(errorOf(res)).toMatchObject({ code: "BAD_REQUEST" });
    expect(errorOf(res).requestId).toMatch(UUID);
  });
});
