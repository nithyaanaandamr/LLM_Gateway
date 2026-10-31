import { describe, expect, it } from "vitest";
import { AppError, toErrorResponse } from "./errors.ts";

const RID = "req-123";

describe("toErrorResponse", () => {
  it("uses an AppError's status, code and message", () => {
    expect(toErrorResponse(new AppError(409, "CONFLICT", "Already exists"), RID)).toEqual({
      statusCode: 409,
      body: { error: { code: "CONFLICT", message: "Already exists", requestId: RID } },
    });
  });

  it("maps validation errors to 400 with a path per issue", () => {
    const error = Object.assign(new Error("body/name must be string"), {
      validation: [
        { instancePath: "/name", message: "too short" },
        { instancePath: "", message: undefined },
      ],
      validationContext: "body",
    });
    expect(toErrorResponse(error, RID)).toEqual({
      statusCode: 400,
      body: {
        error: {
          code: "VALIDATION_FAILED",
          message: "Request is invalid",
          requestId: RID,
          details: [
            { path: "body.name", message: "too short" },
            { path: "body", message: "is invalid" },
          ],
        },
      },
    });
  });

  it("builds nested paths from the instancePath", () => {
    const error = Object.assign(new Error("x"), {
      validation: [{ instancePath: "/a/0/b", message: "bad" }],
      validationContext: "params",
    });
    expect(toErrorResponse(error, RID).body.error.details?.[0]?.path).toBe("params.a.0.b");
  });

  it.each([
    [400, "BAD_REQUEST"],
    [401, "UNAUTHORIZED"],
    [403, "FORBIDDEN"],
    [404, "NOT_FOUND"],
    [409, "CONFLICT"],
    [413, "PAYLOAD_TOO_LARGE"],
    [415, "UNSUPPORTED_MEDIA_TYPE"],
    [429, "RATE_LIMITED"],
    [418, "BAD_REQUEST"],
  ])("maps a %i error to %s and passes its message through", (statusCode, code) => {
    const error = Object.assign(new Error("client problem"), { statusCode });
    expect(toErrorResponse(error, RID)).toEqual({
      statusCode,
      body: { error: { code, message: "client problem", requestId: RID } },
    });
  });

  it("hides plain Error details", () => {
    const { statusCode, body } = toErrorResponse(new Error("password=hunter2"), RID);
    const text = JSON.stringify(body);
    expect(statusCode).toBe(500);
    expect(body.error.code).toBe("INTERNAL");
    expect(text).not.toContain("hunter2");
    expect(text).not.toContain("stack");
  });

  it("turns a 5xx statusCode into 500 INTERNAL", () => {
    const result = toErrorResponse({ statusCode: 503, message: "db down" }, RID);
    expect(result.statusCode).toBe(500);
    expect(result.body.error).toEqual({
      code: "INTERNAL",
      message: "Internal server error",
      requestId: RID,
    });
  });

  it.each([["a string"], [null], [undefined], [42]])("turns %j into 500 INTERNAL", (thrown) => {
    expect(toErrorResponse(thrown, RID).statusCode).toBe(500);
  });

  it("omits details when there are none", () => {
    const error = Object.assign(new Error("x"), { validation: [], validationContext: "body" });
    expect("details" in toErrorResponse(error, RID).body.error).toBe(false);
  });

  it("copies requestId into every body", () => {
    const inputs = [new AppError(404, "NOT_FOUND", "x"), new Error("x"), null];
    for (const input of inputs) {
      expect(toErrorResponse(input, "abc").body.error.requestId).toBe("abc");
    }
  });
});
