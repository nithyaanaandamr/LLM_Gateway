// Checks against the applied database: indexes, cascades, null order, timestamps
import { randomBytes, randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type DbConnection } from "../client.ts";
import { createTestDatabase } from "../testing/index.ts";
import { gatewayKeys, projects } from "./app.ts";
import { accounts, sessions, users } from "./auth.ts";
import { requestLogs } from "./logs.ts";

let connection: DbConnection;
const db = () => connection.db;

beforeAll(async () => {
  connection = createDb(await createTestDatabase());
});

afterAll(() => connection.close());

// Drizzle 0.45 wraps the pg error in `cause`
const violates = (constraint: string) => ({ cause: { constraint } });

async function rows<T extends object>(query: ReturnType<typeof sql>): Promise<T[]> {
  return (await db().execute(query)).rows as T[];
}

async function insertUser() {
  const [user] = await db()
    .insert(users)
    .values({ name: "Test", email: `${randomUUID()}@example.com` })
    .returning();
  return user!;
}

async function insertProject(ownerId: string, name: string) {
  const [project] = await db().insert(projects).values({ ownerId, name }).returning();
  return project!;
}

const logValues = (
  projectId: string,
  overrides: Partial<typeof requestLogs.$inferInsert> = {},
) => ({
  requestId: randomUUID(),
  startedAt: new Date(),
  projectId,
  gatewayKeyId: randomUUID(),
  provider: "openai",
  model: "gpt-test",
  streamed: false,
  outcome: "success" as const,
  statusCode: 200,
  usageSource: "provider" as const,
  durationMs: 10,
  gatewayOverheadMs: 1,
  ...overrides,
});

describe("applied database", () => {
  it("has every named constraint", async () => {
    const found = await rows<{ conname: string }>(
      sql`select c.conname from pg_constraint c join pg_namespace n on n.oid = c.connamespace
          where n.nspname in ('app', 'auth', 'logs') and c.contype in ('c', 'u', 'f', 'p')`,
    );
    const names = new Set(found.map((row) => row.conname));

    for (const expected of [
      "projects_name_length_check",
      "projects_owner_id_name_unique",
      "projects_owner_id_users_id_fk",
      "provider_keys_provider_check",
      "provider_keys_nonce_length_check",
      "provider_keys_auth_tag_length_check",
      "provider_keys_project_id_unique",
      "provider_keys_project_id_projects_id_fk",
      "gateway_keys_name_length_check",
      "gateway_keys_key_hash_length_check",
      "gateway_keys_key_hash_unique",
      "gateway_keys_project_id_projects_id_fk",
      "request_logs_outcome_check",
      "request_logs_reason_check",
      "request_logs_reason_required_check",
      "request_logs_usage_source_check",
      "request_logs_request_id_started_at_pk",
      "usage_hourly_project_id_hour_gateway_key_id_model_pk",
      "users_email_unique",
      "sessions_token_unique",
      "sessions_user_id_users_id_fk",
      "accounts_user_id_users_id_fk",
    ]) {
      expect(names, expected).toContain(expected);
    }
  });

  it("has the BRIN index on started_at", async () => {
    const [index] = await rows<{ indexdef: string }>(
      sql`select indexdef from pg_indexes where indexname = 'request_logs_started_at_brin_idx'`,
    );

    expect(index?.indexdef).toContain("USING brin (started_at)");
  });

  // data-model.md: index (project_id, started_at DESC). Postgres reads that as DESC NULLS FIRST,
  // which is what `ORDER BY started_at DESC` needs. `NULLS LAST` makes the planner sort instead.
  it("has the (project_id, started_at DESC) index with the default null order", async () => {
    const [index] = await rows<{ indexdef: string }>(
      sql`select indexdef from pg_indexes where indexname = 'request_logs_project_id_started_at_idx'`,
    );

    expect(index?.indexdef).toMatch(/\(project_id, started_at DESC\)$/);
  });

  it("uses timestamptz on app and logs tables; auth tables are the known exception", async () => {
    const found = await rows<{ table_schema: string; data_type: string }>(
      sql`select table_schema, data_type from information_schema.columns
          where table_schema in ('app', 'auth', 'logs') and data_type like 'timestamp%'`,
    );

    const bySchema = (schema: string) =>
      new Set(found.filter((c) => c.table_schema === schema).map((c) => c.data_type));
    expect(bySchema("app")).toEqual(new Set(["timestamp with time zone"]));
    expect(bySchema("logs")).toEqual(new Set(["timestamp with time zone"]));
    expect(bySchema("auth")).toEqual(new Set(["timestamp without time zone"]));
  });

  it("uses uuid for every id column", async () => {
    const found = await rows<{ table_name: string; data_type: string }>(
      sql`select table_name, data_type from information_schema.columns
          where table_schema in ('app', 'auth') and column_name = 'id'`,
    );

    expect(found).toHaveLength(7);
    expect(found.every((column) => column.data_type === "uuid")).toBe(true);
  });
});

describe("app edge cases", () => {
  it("limits gateway key names to 1-100 characters", async () => {
    const project = await insertProject((await insertUser()).id, "p");
    const insert = (name: string) =>
      db()
        .insert(gatewayKeys)
        .values({
          projectId: project.id,
          name,
          keyHash: randomBytes(32),
          keyPrefix: "gw_live_abcd",
        });

    await expect(insert("")).rejects.toMatchObject(violates("gateway_keys_name_length_check"));
    await expect(insert("x".repeat(101))).rejects.toMatchObject(
      violates("gateway_keys_name_length_check"),
    );
    await expect(insert("x")).resolves.toBeDefined();
    await expect(insert("x".repeat(100))).resolves.toBeDefined();
  });

  it("counts characters, not bytes: 100 emoji pass, 101 fail", async () => {
    const owner = await insertUser();

    await expect(insertProject(owner.id, "😀".repeat(100))).resolves.toBeDefined();
    await expect(insertProject(owner.id, "😀".repeat(101))).rejects.toMatchObject(
      violates("projects_name_length_check"),
    );
  });

  it("deleting a project removes its keys but not its log rows", async () => {
    const project = await insertProject((await insertUser()).id, "p");
    await db()
      .insert(gatewayKeys)
      .values({
        projectId: project.id,
        name: "k",
        keyHash: randomBytes(32),
        keyPrefix: "gw_live_abcd",
      });
    await db().insert(requestLogs).values(logValues(project.id));

    await db().delete(projects).where(eq(projects.id, project.id));

    expect(
      await db().select().from(gatewayKeys).where(eq(gatewayKeys.projectId, project.id)),
    ).toHaveLength(0);
    expect(
      await db().select().from(requestLogs).where(eq(requestLogs.projectId, project.id)),
    ).toHaveLength(1);
  });

  it("does not change updated_at on a raw SQL update (documented: no trigger)", async () => {
    const project = await insertProject((await insertUser()).id, "p");
    const old = "2020-01-01T00:00:00Z";
    await db().execute(sql`update app.projects set updated_at = ${old} where id = ${project.id}`);

    await db().execute(sql`update app.projects set name = 'renamed' where id = ${project.id}`);
    const [after] = await rows<{ unchanged: boolean }>(
      sql`select updated_at = ${old}::timestamptz as unchanged from app.projects where id = ${project.id}`,
    );

    expect(after?.unchanged).toBe(true);
  });
});

describe("logs edge cases", () => {
  it("allows a reason on a success row", async () => {
    await expect(
      db()
        .insert(requestLogs)
        .values(logValues(randomUUID(), { reason: "internal" })),
    ).resolves.toBeDefined();
  });

  it("rejects provider_error without a reason", async () => {
    await expect(
      db()
        .insert(requestLogs)
        .values(logValues(randomUUID(), { outcome: "provider_error" })),
    ).rejects.toMatchObject(violates("request_logs_reason_required_check"));
  });
});

describe("auth tables", () => {
  it("rejects a duplicate email and a duplicate session token", async () => {
    const user = await insertUser();
    await expect(
      db().insert(users).values({ name: "Dup", email: user.email }),
    ).rejects.toMatchObject(violates("users_email_unique"));

    const session = {
      userId: user.id,
      token: randomUUID(),
      expiresAt: new Date(),
      updatedAt: new Date(),
    };
    await db().insert(sessions).values(session);
    await expect(db().insert(sessions).values(session)).rejects.toMatchObject(
      violates("sessions_token_unique"),
    );
  });

  it("deleting a user removes their sessions and accounts", async () => {
    const user = await insertUser();
    await db().insert(sessions).values({
      userId: user.id,
      token: randomUUID(),
      expiresAt: new Date(),
      updatedAt: new Date(),
    });
    await db()
      .insert(accounts)
      .values({ userId: user.id, accountId: "a", providerId: "credential", updatedAt: new Date() });

    await db().delete(users).where(eq(users.id, user.id));

    expect(await db().select().from(sessions).where(eq(sessions.userId, user.id))).toHaveLength(0);
    expect(await db().select().from(accounts).where(eq(accounts.userId, user.id))).toHaveLength(0);
  });

  // Run with TZ=Australia/Sydney too: timestamp without time zone must still round-trip as UTC
  it("round-trips a timestamp without time zone exactly", async () => {
    const createdAt = new Date("2025-06-01T12:34:56.789Z");
    const [user] = await db()
      .insert(users)
      .values({ name: "Tz", email: `${randomUUID()}@example.com`, createdAt })
      .returning();

    expect(user!.createdAt.toISOString()).toBe(createdAt.toISOString());
  });
});
