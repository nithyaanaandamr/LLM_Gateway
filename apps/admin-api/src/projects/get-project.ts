import type { Project } from "@gw/db";
import type { FastifyRequest } from "fastify";

// The project the logged-in user may access. Only valid in a route inside the project scope.
// Use its `id` (from the database, always lowercase), never the URL's projectId.
// see PITFALLS.md: Use the project ID from the database
export function getProject(request: FastifyRequest): Project {
  if (!request.project) {
    // A programming error (route outside the project scope), not a client error: becomes a logged 500
    throw new Error("getProject called outside the project scope");
  }
  return request.project;
}
