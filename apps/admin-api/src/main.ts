// Starts the admin API. Dev: pnpm dev (loads ../../.env). Prod: pnpm start (real env vars only).
import { buildApp } from "./app.ts";
import { ConfigError, loadConfig, type Config } from "./config.ts";
import { closeOnSignals } from "./shutdown.ts";

function readConfigOrExit(): Config {
  try {
    return loadConfig(process.env);
  } catch (e) {
    if (!(e instanceof ConfigError)) throw e;
    console.error(e.message);
    process.exit(1);
  }
}

const config = readConfigOrExit();
const app = buildApp(config);
closeOnSignals(app);

try {
  await app.listen({ port: config.port, host: config.host });
} catch (err) {
  app.log.error({ err }, "failed to start");
  process.exit(1);
}
