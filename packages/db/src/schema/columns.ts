import { type SQL, sql } from "drizzle-orm";
import { type AnyPgColumn, customType, timestamp } from "drizzle-orm/pg-core";

// drizzle-orm 0.45 has no built-in bytea; node-postgres reads and writes Buffer
// (see PITFALLS.md: Drizzle column gotchas)
export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

// see PITFALLS.md: updated_at is set by Drizzle
export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => sql`now()`),
};

// `column in ('a', 'b')` for CHECK constraints, from the same array as the TS type.
// Values are our own constants, never user input, so sql.raw is safe here.
export function isOneOf(column: AnyPgColumn, values: readonly string[]): SQL {
  return sql`${column} in (${sql.raw(values.map((value) => `'${value}'`).join(", "))})`;
}
