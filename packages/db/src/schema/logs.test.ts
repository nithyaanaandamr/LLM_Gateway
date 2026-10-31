import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type DbConnection } from "../client.ts";
import { createTestDatabase } from "../testing/index.ts";
import { requestLogs, type OUTCOMES, type REASONS, type USAGE_SOURCES } from "./logs.ts";

let connection: DbConnection;
const db = () => connection.db;

beforeAll(async () => {
  connection = createDb(await createTestDatabase());
});

afterAll(() => connection.close());

type LogRow = typeof requestLogs.$inferInsert;

function logRow(overrides: Partial<LogRow> = {}): LogRow {
  return {
    requestId: randomUUID(),
    startedAt: new Date(),
    projectId: randomUUID(),
    gatewayKeyId: randomUUID(),
    provider: "openai",
    model: "gpt-test",
    streamed: false,
    outcome: "success",
    statusCode: 200,
    usageSource: "provider",
    durationMs: 10,
    gatewayOverheadMs: 1,
    ...overrides,
  };
}

// Drizzle 0.45 wraps the pg error in `cause`
const violates = (constraint: string) => ({ cause: { constraint } });

describe("logs.request_logs", () => {
  it("skips a duplicate (request_id, started_at) and reads money back as bigint", async () => {
    const row = logRow();
    const [inserted] = await db().insert(requestLogs).values(row).returning();
    const again = await db().insert(requestLogs).values(row).onConflictDoNothing().returning();

    expect(again).toHaveLength(0);
    expect(inserted!.inputCostNanos).toBe(0n);
  });

  it("accepts a project id that does not exist in app.projects (no foreign keys)", async () => {
    const row = logRow({ projectId: randomUUID(), gatewayKeyId: randomUUID() });

    await expect(db().insert(requestLogs).values(row)).resolves.toBeDefined();
  });

  it("rejects unknown outcome, reason and usage source", async () => {
    // Casts bypass the TS types to reach the DB rules
    const insert = (overrides: Partial<LogRow>) =>
      db().insert(requestLogs).values(logRow(overrides));

    await expect(insert({ outcome: "nope" as (typeof OUTCOMES)[number] })).rejects.toMatchObject(
      violates("request_logs_outcome_check"),
    );
    await expect(
      insert({ outcome: "blocked", reason: "nope" as (typeof REASONS)[number] }),
    ).rejects.toMatchObject(violates("request_logs_reason_check"));
    await expect(
      insert({ usageSource: "nope" as (typeof USAGE_SOURCES)[number] }),
    ).rejects.toMatchObject(violates("request_logs_usage_source_check"));
  });

  it("requires a reason unless the outcome is success or client_disconnected", async () => {
    const insert = (overrides: Partial<LogRow>) =>
      db().insert(requestLogs).values(logRow(overrides));

    await expect(insert({ outcome: "blocked" })).rejects.toMatchObject(
      violates("request_logs_reason_required_check"),
    );
    await expect(
      insert({ outcome: "blocked", reason: "budget_cap_reached" }),
    ).resolves.toBeDefined();
    await expect(insert({ outcome: "client_disconnected" })).resolves.toBeDefined();
  });
});
