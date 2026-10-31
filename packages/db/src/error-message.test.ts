import { describe, expect, it } from "vitest";
import { describeError } from "./error-message.ts";

describe("describeError", () => {
  it("uses the cause message when present", () => {
    const error = new Error("Failed query: x", { cause: new Error("connect ECONNREFUSED") });
    expect(describeError(error)).toBe("connect ECONNREFUSED");
  });

  it("falls back to the cause code when its message is empty", () => {
    const cause = Object.assign(new AggregateError([]), { code: "ECONNREFUSED" });
    expect(describeError(new Error("Failed query: x", { cause }))).toBe("ECONNREFUSED");
  });

  it("uses the error message without a cause", () => {
    expect(describeError(new Error("boom"))).toBe("boom");
  });

  it("stringifies non-errors", () => {
    expect(describeError("oops")).toBe("oops");
  });
});
