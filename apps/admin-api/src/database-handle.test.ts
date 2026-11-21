// Type test: app code gets an opaque Database and can't query with it.
// `pnpm typecheck` (tsc) fails if Database ever gains one of these methods.
// see PITFALLS.md: Apps get an opaque Database
import type { Database } from "@gw/db";
import { describe, expectTypeOf, it } from "vitest";

describe("Database handle", () => {
  it("has no query methods", () => {
    expectTypeOf<Database>().not.toHaveProperty("select");
    expectTypeOf<Database>().not.toHaveProperty("query");
    expectTypeOf<Database>().not.toHaveProperty("execute");
    expectTypeOf<Database>().not.toHaveProperty("transaction");
  });
});
