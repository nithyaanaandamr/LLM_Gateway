import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { request, sessionCookieOf } from "./testing/fetch-requests.ts";
import { killAllServers, startListening } from "./testing/server-process.ts";
import { testConfig } from "./testing/test-config.ts";
import { testEnv } from "./testing/test-env.ts";

const FIXTURE = fileURLToPath(new URL("./test-server.fixture.ts", import.meta.url));

let env: Record<string, string>;

beforeAll(async () => {
  env = testEnv(await testConfig());
});

afterEach(killAllServers);

const send = (url: string, method: string, body?: unknown, cookie?: string) =>
  request(url, { method, origin: env["DASHBOARD_ORIGIN"] ?? "", body, cookie });

describe("real process: provider keys stay out of logs and errors", { timeout: 30_000 }, () => {
  it("a stored key and a refused key appear nowhere in stdout, stderr or the 400 body", async () => {
    const validCanary = "sk-test-" + randomBytes(16).toString("hex");
    const invalidCanary = "gw_live_" + randomBytes(32).toString("hex");
    const p = await startListening(FIXTURE, env);

    const signUp = await send(`${p.url}/api/auth/sign-up/email`, "POST", {
      name: "Log Check",
      email: "provider-key-logs@example.com",
      password: "correct-horse-battery",
    });
    expect(signUp.status).toBe(200);
    const cookie = sessionCookieOf(signUp);
    const created = await send(`${p.url}/api/projects`, "POST", { name: "p" }, cookie);
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };
    const url = `${p.url}/api/projects/${id}/provider-key`;

    const stored = await send(url, "PUT", { provider: "openai", key: validCanary }, cookie);
    expect(stored.status).toBe(200);
    const refused = await send(url, "PUT", { provider: "openai", key: invalidCanary }, cookie);
    expect(refused.status).toBe(400);
    expect(await refused.text()).not.toContain(invalidCanary);
    const read = await send(url, "GET", undefined, cookie);
    expect(read.status).toBe(200);

    p.child.kill("SIGTERM");
    await p.exited;
    const output = p.out() + p.err();
    expect(output).toContain(id); // the requests were logged, so this check is not vacuous
    for (const secret of [validCanary, invalidCanary, env["MASTER_KEY"] ?? ""]) {
      expect(secret).not.toBe("");
      expect(output).not.toContain(secret);
    }
  });
});
