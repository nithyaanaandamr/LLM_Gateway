import { Writable } from "node:stream";
import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { loggerOptions } from "./logger.ts";

function buildLogged(logLevel: "info" | "warn") {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _enc, cb) {
      lines.push(chunk.toString());
      cb();
    },
  });
  const app = Fastify({ logger: { ...loggerOptions({ logLevel }), stream } });
  return { app, output: () => lines.join("") };
}

describe("loggerOptions", () => {
  it("redacts auth headers and set-cookie", async () => {
    const { app, output } = buildLogged("info");
    app.log.info({ headers: { authorization: "Bearer SENTINEL", cookie: "s=SENTINEL" } }, "a");
    app.log.info(
      { req: { headers: { authorization: "Bearer SENTINEL", cookie: "s=SENTINEL" } } },
      "b",
    );
    app.log.info({ res: { headers: { "set-cookie": "s=SENTINEL" } } }, "c");
    await app.close();
    expect(output()).toContain("[redacted]");
    expect(output()).not.toContain("SENTINEL");
  });

  it("drops lines below the configured level", async () => {
    const { app, output } = buildLogged("warn");
    app.log.info("quiet");
    app.log.warn("loud");
    await app.close();
    expect(output()).not.toContain("quiet");
    expect(output()).toContain("loud");
  });
});
