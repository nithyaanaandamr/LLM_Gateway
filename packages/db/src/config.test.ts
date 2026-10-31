import { describe, expect, it } from "vitest";
import { readDatabaseUrl } from "./config.ts";

const read = (value?: string) => readDatabaseUrl({ DATABASE_URL: value });

describe("readDatabaseUrl", () => {
  it.each(["postgres://u:p@h/db", "postgresql://u:p@h/db"])("returns %s unchanged", (url) => {
    expect(read(url)).toBe(url);
  });

  it.each([undefined, "", "   "])("throws when unset: %j", (value) => {
    expect(() => read(value)).toThrow("DATABASE_URL is not set");
  });

  it.each(["not a url", "mysql://u:p@h/db"])("throws for non-postgres URL: %s", (value) => {
    expect(() => read(value)).toThrow("DATABASE_URL must be a postgres:// or postgresql:// URL");
  });

  it("does not put the value in the error", () => {
    try {
      read("http://u:s3cret@h/db");
    } catch (error) {
      expect((error as Error).message).not.toContain("s3cret");
    }
  });
});
