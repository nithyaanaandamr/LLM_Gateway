// The real Drizzle client behind a Database handle. For @gw/auth and tests only; apps are
// banned from this entry by lint (see PITFALLS.md: Apps get an opaque Database).
export { toDrizzle, type DrizzleDatabase } from "./client.ts";
