// One error shape for the whole API (see PITFALLS.md: Error responses never leak internals)
import type { FastifyError } from "fastify";

export const ERROR_CODES = [
  "BAD_REQUEST",
  "VALIDATION_FAILED",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "PAYLOAD_TOO_LARGE",
  "UNSUPPORTED_MEDIA_TYPE",
  "RATE_LIMITED",
  "INTERNAL",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export type ValidationDetail = { path: string; message: string };
export type ErrorBody = {
  error: { code: ErrorCode; message: string; requestId: string; details?: ValidationDetail[] };
};

// Message must be safe to show to the client
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;

  constructor(statusCode: number, code: ErrorCode, message: string) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

const CODE_BY_STATUS: Record<number, ErrorCode> = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  413: "PAYLOAD_TOO_LARGE",
  415: "UNSUPPORTED_MEDIA_TYPE",
  429: "RATE_LIMITED",
};

type Response = { statusCode: number; body: ErrorBody };

function build(
  statusCode: number,
  code: ErrorCode,
  message: string,
  requestId: string,
  details?: ValidationDetail[],
): Response {
  const error: ErrorBody["error"] = { code, message, requestId };
  if (details && details.length > 0) error.details = details;
  return { statusCode, body: { error } };
}

function toDetails(error: Partial<FastifyError>): ValidationDetail[] {
  return (error.validation ?? []).map((item) => ({
    path: [error.validationContext, ...item.instancePath.split("/").filter(Boolean)]
      .filter(Boolean)
      .join("."),
    message: item.message ?? "is invalid",
  }));
}

export function toErrorResponse(error: unknown, requestId: string): Response {
  if (error instanceof AppError) {
    return build(error.statusCode, error.code, error.message, requestId);
  }
  const fe: Partial<FastifyError> = typeof error === "object" && error !== null ? error : {};
  if (Array.isArray(fe.validation)) {
    return build(400, "VALIDATION_FAILED", "Request is invalid", requestId, toDetails(fe));
  }
  const status = fe.statusCode;
  if (typeof status === "number" && status >= 400 && status <= 499) {
    const message = typeof fe.message === "string" ? fe.message : "Bad request";
    return build(status, CODE_BY_STATUS[status] ?? "BAD_REQUEST", message, requestId);
  }
  return build(500, "INTERNAL", "Internal server error", requestId);
}
