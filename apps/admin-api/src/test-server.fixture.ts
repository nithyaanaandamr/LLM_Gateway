// Test fixture: the real app plus a few routes, run as a real process by server-process.test.ts
import { setTimeout as sleep } from "node:timers/promises";
import { buildApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { closeOnSignals } from "./shutdown.ts";

const app = buildApp(loadConfig(process.env));
closeOnSignals(app);
app.get("/boom", () => {
  throw new Error("db password=hunter2 at /srv/secret/file.ts");
});
app.get("/log-headers", (request) => {
  request.log.info({ headers: request.headers }, "got headers");
  return { ok: true };
});
app.get("/slow", async () => {
  await sleep(700);
  return { done: true };
});
await app.listen({ port: 0, host: "127.0.0.1" });
