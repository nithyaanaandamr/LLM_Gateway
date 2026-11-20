import { DrizzleQueryError } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { errorForLog } from "./log-error.ts";

const SQL = 'select * from "auth"."users" where "email" = $1';

function queryError(cause?: Error) {
  return new DrizzleQueryError(SQL, ["SENTINEL@example.com"], cause);
}

function connectionRefused() {
  return Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:1"), { code: "ECONNREFUSED" });
}

describe("errorForLog", () => {
  it("keeps only the type and the cause code of a query error", () => {
    expect(errorForLog(queryError(connectionRefused()))).toEqual({
      type: "DrizzleQueryError",
      code: "ECONNREFUSED",
    });
  });

  it("leaves no query text or params in what it returns", () => {
    const logged = JSON.stringify(errorForLog(queryError(connectionRefused())));
    expect(logged).not.toContain("SENTINEL");
    expect(logged).not.toContain("select");
  });

  it("reads the code from a Postgres error, ignoring its other fields", () => {
    const cause = Object.assign(new Error("terminating connection"), {
      code: "57P01",
      detail: "Key (email)=(SENTINEL@example.com)",
    });
    expect(errorForLog(queryError(cause))).toEqual({ type: "DrizzleQueryError", code: "57P01" });
    expect(JSON.stringify(errorForLog(queryError(cause)))).not.toContain("SENTINEL");
  });

  it("finds a query error wrapped inside another error", () => {
    const wrapped = new Error("Failed to get session", { cause: queryError(connectionRefused()) });
    expect(errorForLog(wrapped)).toEqual({ type: "DrizzleQueryError", code: "ECONNREFUSED" });
  });

  it("leaves the code out when the cause has none", () => {
    expect(errorForLog(queryError(new Error("odd")))).toEqual({
      type: "DrizzleQueryError",
      code: undefined,
    });
  });

  it("drops a code that is not a short identifier", () => {
    const cause = Object.assign(new Error("x"), { code: "has spaces and SENTINEL@example.com" });
    expect(errorForLog(queryError(cause))).toEqual({ type: "DrizzleQueryError", code: undefined });
  });

  it("redacts an error chain deeper than the cap instead of passing it through", () => {
    let deep: Error = queryError(connectionRefused());
    for (let i = 0; i < 5; i++) deep = new Error("wrapper", { cause: deep });

    const logged = errorForLog(deep);

    expect(logged).toEqual({ type: "TruncatedErrorChain" });
    expect(JSON.stringify(logged)).not.toContain("SENTINEL");
  });

  it("still finds a query error at the last inspected depth", () => {
    // code is undefined: the cause that holds it sits one level past the cap, so it is not read
    let deep: Error = queryError(connectionRefused());
    for (let i = 0; i < 4; i++) deep = new Error("wrapper", { cause: deep });

    expect(errorForLog(deep)).toEqual({ type: "DrizzleQueryError", code: undefined });
  });

  it("matches Drizzle's class name, so a rename fails here with a clear message", () => {
    expect(queryError().constructor.name).toBe("DrizzleQueryError");
  });

  it("passes other errors and values through unchanged", () => {
    const plain = new Error("boom");
    expect(errorForLog(plain)).toBe(plain);
    expect(errorForLog("text")).toBe("text");
    expect(errorForLog(null)).toBeNull();
  });
});
