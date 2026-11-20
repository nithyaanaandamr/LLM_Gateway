import { z } from "zod";
import { AppError, CODE_BY_STATUS } from "../errors.ts";

// What Better Auth sends on an error; both fields are optional because we don't control them
const betterAuthErrorBody = z.object({
  message: z.string().min(1).optional(),
  code: z.string().optional(),
});

// Better Auth code strings we map on purpose; a library upgrade that renames one fails a test
const USER_EXISTS = "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL";
const VALIDATION_ERROR = "VALIDATION_ERROR";

const MESSAGE_BY_STATUS: Record<number, string> = {
  400: "Bad request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not found",
  429: "Too many requests",
};

// Better Auth error Response -> an Error for our error handler (throw it).
// 4xx become an AppError with Better Auth's message (safe to show). 5xx and non-error statuses
// become a plain Error: the handler logs it and the client gets the generic 500, never the body.
export async function toAuthError(response: Response): Promise<Error> {
  // 5xx, or a status that is not an error at all: both are unexpected here
  if (response.status >= 500 || response.status < 400) {
    return new Error(`Better Auth responded with ${response.status}`);
  }
  const { message, code } = await readBody(response);
  if (code === USER_EXISTS) return new AppError(409, "CONFLICT", message ?? "User already exists");
  if (code === VALIDATION_ERROR) {
    return new AppError(400, "VALIDATION_FAILED", message ?? "Request is invalid");
  }
  return new AppError(
    response.status,
    CODE_BY_STATUS[response.status] ?? "BAD_REQUEST",
    message ?? MESSAGE_BY_STATUS[response.status] ?? "Request failed",
  );
}

async function readBody(response: Response): Promise<z.infer<typeof betterAuthErrorBody>> {
  try {
    return betterAuthErrorBody.parse(JSON.parse(await response.text()));
  } catch {
    return {};
  }
}
