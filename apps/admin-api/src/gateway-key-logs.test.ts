import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { killAllServers, logLines, startListening, stopServer } from "./testing/server-process.ts";
import { testConfig } from "./testing/test-config.ts";
import { testEnv } from "./testing/test-env.ts";

const FIXTURE = fileURLToPath(new URL("./test-server.fixture.ts", import.meta.url));

let env: Record<string, string>;

beforeAll(async () => {
  env = testEnv(await testConfig());
});

afterEach(killAllServers);

// JSON request with the dashboard Origin, which the protected scope requires on writes
function send(url: string, method: string, body: unknown, cookie?: string) {
  return fetch(url, {
    method,
    headers: {
      origin: env["DASHBOARD_ORIGIN"] ?? "",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(cookie ? { cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe("real process: gateway keys stay out of the logs", { timeout: 30_000 }, () => {
  it("issue, list and revoke over real HTTP: the key is on neither stdout nor stderr", async () => {
    const p = await startListening(FIXTURE, env);
    const signUp = await send(`${p.url}/api/auth/sign-up/email`, "POST", {
      name: "Real Process",
      email: `${randomUUID()}@example.com`,
      password: "correct-horse-battery",
    });
    expect(signUp.status).toBe(200);
    const cookie = signUp.headers.getSetCookie().find((c) => c.includes("session_token="));
    const session = cookie?.split(";")[0] ?? "";
    const project = await send(`${p.url}/api/projects`, "POST", { name: "Prod" }, session);
    const { id: projectId } = (await project.json()) as { id: string };
    const base = `${p.url}/api/projects/${projectId}/gateway-keys`;

    const issued = await send(base, "POST", { name: "ci" }, session);
    const { key, gatewayKey } = (await issued.json()) as {
      key: string;
      gatewayKey: { id: string };
    };
    const listed = await send(base, "GET", undefined, session);
    const listedText = await listed.text();
    const revoked = await send(`${base}/${gatewayKey.id}`, "DELETE", undefined, session);
    await stopServer(p);

    expect([issued.status, listed.status, revoked.status]).toEqual([201, 200, 204]);
    expect(key).toMatch(/^gw_live_[0-9a-f]{64}$/);
    expect(listedText).not.toContain(key.slice("gw_live_".length));
    const output = p.out() + p.err();
    expect(output).not.toContain(key);
    expect(output).not.toContain(key.slice("gw_live_".length));
    expect(output).not.toMatch(/[0-9a-f]{64}/);
    expect(p.err()).toBe("");
    // The requests were logged (so the check above is meaningful), without the key
    expect(logLines(p.out()).some((l) => l.req ?? l.res)).toBe(true);
  });
});
