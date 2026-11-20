import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { sendWebResponse } from "./send-web-response.ts";

describe("sendWebResponse", () => {
  let app: FastifyInstance;
  afterEach(() => app.close());

  function injectResponse(response: () => Response) {
    app = Fastify();
    app.get("/x", (_request, reply) => sendWebResponse(reply, response()));
    return app.inject("/x");
  }

  it("copies status, headers and body", async () => {
    const res = await injectResponse(
      () =>
        new Response('{"ok":true}', {
          status: 201,
          headers: { "content-type": "application/json", "x-custom": "yes" },
        }),
    );
    expect(res.statusCode).toBe(201);
    expect(res.headers["x-custom"]).toBe("yes");
    expect(res.headers["content-type"]).toMatch(/^application\/json/);
    expect(res.body).toBe('{"ok":true}');
  });

  it("sends two Set-Cookie values as two separate headers", async () => {
    const res = await injectResponse(() => {
      const headers = new Headers();
      headers.append("set-cookie", "a=1; Path=/; HttpOnly");
      headers.append("set-cookie", "b=2; Expires=Wed, 21 Oct 2026 07:28:00 GMT; Path=/");
      return new Response("{}", { headers });
    });
    expect(res.headers["set-cookie"]).toEqual([
      "a=1; Path=/; HttpOnly",
      "b=2; Expires=Wed, 21 Oct 2026 07:28:00 GMT; Path=/",
    ]);
  });

  it("sends a JSON null body untouched", async () => {
    const res = await injectResponse(
      () => new Response("null", { headers: { "content-type": "application/json" } }),
    );
    expect(res.body).toBe("null");
    expect(res.json()).toBeNull();
  });

  it("sends an empty body for a 204", async () => {
    const res = await injectResponse(() => new Response(null, { status: 204 }));
    expect(res.statusCode).toBe(204);
    expect(res.body).toBe("");
  });

  it("lets Fastify set the content-length for the body it sends", async () => {
    const res = await injectResponse(
      () => new Response("hello", { headers: { "content-length": "999" } }),
    );
    expect(res.headers["content-length"]).toBe("5");
  });
});
