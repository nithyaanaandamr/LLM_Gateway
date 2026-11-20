import { Writable } from "node:stream";
import { DrizzleQueryError } from "drizzle-orm";
import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { errorHandler } from "./error-handler.ts";
import { loggerOptions } from "./logger.ts";

function appThatThrows(error: Error) {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _enc, cb) {
      lines.push(chunk.toString());
      cb();
    },
  });
  const app = Fastify({ logger: { ...loggerOptions({ logLevel: "info" }), stream } });
  app.setErrorHandler(errorHandler);
  app.get("/fail", () => {
    throw error;
  });
  const parsed = () => lines.map((line) => JSON.parse(line) as Record<string, unknown>);
  return { app, parsed };
}

describe("errorHandler logging", () => {
  it("logs a database error as type and code only, never its query or params", async () => {
    const cause = Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
    const failed = new DrizzleQueryError("select 1 where token = $1", ["SENTINEL_TOKEN"], cause);
    const { app, parsed } = appThatThrows(failed);

    const res = await app.inject({ url: "/fail" });
    await app.close();

    expect(res.statusCode).toBe(500);
    const line = parsed().find((l) => l.msg === "request failed");
    expect(line).toMatchObject({
      level: 50,
      err: { type: "DrizzleQueryError", code: "ECONNREFUSED" },
    });
    expect(JSON.stringify(parsed())).not.toMatch(/SENTINEL|select/);
  });

  it("still logs the full error for other 5xx errors", async () => {
    const { app, parsed } = appThatThrows(new Error("something broke"));

    await app.inject({ url: "/fail" });
    await app.close();

    const line = parsed().find((l) => l.msg === "request failed");
    expect(line).toMatchObject({ level: 50, err: { message: "something broke" } });
  });
});
