import type { FastifyReply, FastifyRequest } from "fastify";
import { toErrorResponse, type ErrorBody } from "./errors.ts";
import { errorForLog } from "./log-error.ts";

export function errorHandler(
  error: unknown,
  request: FastifyRequest,
  reply: FastifyReply,
): FastifyReply {
  const { statusCode, body } = toErrorResponse(error, request.id);
  if (statusCode >= 500) {
    // see PITFALLS.md: Custom error handler must log
    request.log.error({ err: errorForLog(error) }, "request failed");
  }
  return reply.status(statusCode).send(body);
}

// For errors Fastify raises before routing (e.g. invalid URL)
export function frameworkErrorHandler(
  error: unknown,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  // These errors skip the onSend hooks (no route yet), so set what the hook would set
  reply.header("cache-control", "no-store");
  void errorHandler(error, request, reply);
}

export function notFoundHandler(request: FastifyRequest, reply: FastifyReply): FastifyReply {
  const body: ErrorBody = {
    error: { code: "NOT_FOUND", message: "Route not found", requestId: request.id },
  };
  return reply.status(404).send(body);
}
