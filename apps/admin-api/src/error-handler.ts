import type { FastifyReply, FastifyRequest } from "fastify";
import { toErrorResponse, type ErrorBody } from "./errors.ts";

export function errorHandler(
  error: unknown,
  request: FastifyRequest,
  reply: FastifyReply,
): FastifyReply {
  const { statusCode, body } = toErrorResponse(error, request.id);
  if (statusCode >= 500) {
    // see PITFALLS.md: Custom error handler must log
    request.log.error({ err: error }, "request failed");
  }
  return reply.status(statusCode).send(body);
}

// For errors Fastify raises before routing (e.g. invalid URL)
export function frameworkErrorHandler(
  error: unknown,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  void errorHandler(error, request, reply);
}

export function notFoundHandler(request: FastifyRequest, reply: FastifyReply): FastifyReply {
  const body: ErrorBody = {
    error: { code: "NOT_FOUND", message: "Route not found", requestId: request.id },
  };
  return reply.status(404).send(body);
}
