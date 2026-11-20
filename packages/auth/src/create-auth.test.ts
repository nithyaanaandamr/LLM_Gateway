import { createDb, type DbConnection, users } from "@gw/db";
import { createTestDatabase } from "@gw/db/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuth } from "./create-auth.ts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("createAuth", () => {
  let connection: DbConnection;

  beforeAll(async () => {
    connection = createDb(await createTestDatabase());
  });

  afterAll(() => connection.close());

  it("stores users in auth.users with UUID ids", async () => {
    const context = await createAuth({ db: connection.db }).$context;
    // 1.7 requires a provisioning source as the second argument
    const user = await context.internalAdapter.createUser(
      { name: "Ada", email: "ada@example.com" },
      { method: "email-password" },
    );

    expect(user.id).toMatch(UUID_PATTERN);
    const rows = await connection.db.select().from(users).where(eq(users.id, user.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.email).toBe("ada@example.com");
  });
});
