import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { errorHandler } from "../error-handler.ts";
import { AppError } from "../errors.ts";
import { toAuthError } from "./auth-error.ts";

function jsonResponse(status: number, body: object): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function appErrorFor(response: Response): Promise<AppError> {
  const error = await toAuthError(response);
  if (!(error instanceof AppError)) throw new Error("expected an AppError");
  return error;
}

describe("toAuthError", () => {
  it.each([
    [401, "UNAUTHORIZED"],
    [403, "FORBIDDEN"],
    [429, "RATE_LIMITED"],
    [404, "NOT_FOUND"],
    [400, "BAD_REQUEST"],
  ])("maps status %i to %s and keeps the message", async (status, code) => {
    const error = await appErrorFor(jsonResponse(status, { message: "Some message", code: "X" }));
    expect(error).toMatchObject({ statusCode: status, code, message: "Some message" });
  });

  // Pins Better Auth's code string: a library upgrade that renames it fails here
  it("maps 422 USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL to 409 CONFLICT", async () => {
    const response = jsonResponse(422, {
      message: "User already exists. Use another email.",
      code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
    });
    expect(await appErrorFor(response)).toMatchObject({
      statusCode: 409,
      code: "CONFLICT",
      message: "User already exists. Use another email.",
    });
  });

  it("maps VALIDATION_ERROR to 400 VALIDATION_FAILED", async () => {
    const error = await appErrorFor(
      jsonResponse(400, { message: "Invalid body", code: "VALIDATION_ERROR" }),
    );
    expect(error).toMatchObject({ statusCode: 400, code: "VALIDATION_FAILED" });
  });

  it("keeps the status of another 4xx and calls it BAD_REQUEST", async () => {
    const error = await appErrorFor(
      jsonResponse(422, { message: "Failed", code: "FAILED_TO_CREATE_USER" }),
    );
    expect(error).toMatchObject({ statusCode: 422, code: "BAD_REQUEST", message: "Failed" });
  });

  it("uses a message based on the status for a non-JSON body", async () => {
    const error = await appErrorFor(new Response("<html>nope</html>", { status: 403 }));
    expect(error).toMatchObject({ statusCode: 403, code: "FORBIDDEN", message: "Forbidden" });
    expect(error.message).not.toContain("html");
  });

  it("uses a message based on the status for an empty body or one without a message", async () => {
    expect((await appErrorFor(new Response(null, { status: 401 }))).message).toBe("Unauthorized");
    expect((await appErrorFor(jsonResponse(429, { code: "X" }))).message).toBe("Too many requests");
  });

  it("returns a plain Error for a 5xx, without the body", async () => {
    const error = await toAuthError(
      jsonResponse(500, { message: "relation auth.users: password=hunter2" }),
    );
    expect(error).not.toBeInstanceOf(AppError);
    expect(error.message).not.toContain("hunter2");
  });
});

describe("toAuthError through the error handler", () => {
  it("shows 4xx in our shape and a 5xx body to nobody", async () => {
    const app = Fastify();
    app.setErrorHandler(errorHandler);
    app.get("/four", async () => {
      throw await toAuthError(jsonResponse(401, { message: "Invalid email or password" }));
    });
    app.get("/five", async () => {
      throw await toAuthError(jsonResponse(500, { message: "password=hunter2" }));
    });

    const four = await app.inject("/four");
    expect(four.statusCode).toBe(401);
    expect(four.json<{ error: object }>().error).toMatchObject({
      code: "UNAUTHORIZED",
      message: "Invalid email or password",
    });

    const five = await app.inject("/five");
    expect(five.statusCode).toBe(500);
    expect(five.json<{ error: object }>().error).toMatchObject({
      code: "INTERNAL",
      message: "Internal server error",
    });
    expect(five.body).not.toContain("hunter2");
    await app.close();
  });
});
