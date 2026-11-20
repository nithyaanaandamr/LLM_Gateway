import { Writable } from "node:stream";
import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { loggerOptions } from "../logger.ts";
import { pinoAuthLog } from "./create-app-auth.ts";

function loggerWithOutput() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _enc, cb) {
      lines.push(chunk.toString());
      cb();
    },
  });
  const app = Fastify({ logger: { ...loggerOptions({ logLevel: "info" }), stream } });
  const parsed = () => lines.map((line) => JSON.parse(line) as Record<string, unknown>);
  return { app, parsed };
}

describe("pinoAuthLog", () => {
  it("writes the message at the matching pino level", async () => {
    const { app, parsed } = loggerWithOutput();

    pinoAuthLog(app.log)("warn", "Invalid password");
    await app.close();

    expect(parsed()).toEqual([expect.objectContaining({ level: 40, msg: "Invalid password" })]);
  });

  it("keeps an Error but drops other arguments, which can hold request data", async () => {
    const { app, parsed } = loggerWithOutput();

    pinoAuthLog(app.log)("error", "Failed", { email: "SENTINEL@example.com" }, new Error("boom"));
    await app.close();

    const [line] = parsed();
    expect(line).toMatchObject({ level: 50, msg: "Failed", err: { message: "boom" } });
    expect(JSON.stringify(line)).not.toContain("SENTINEL");
  });
});
