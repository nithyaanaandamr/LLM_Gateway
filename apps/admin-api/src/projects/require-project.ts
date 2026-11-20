import { findAccessibleProject, type Database, type Project } from "@gw/db";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { getAuthUser } from "../auth/get-auth-user.ts";
import { projectNotFound } from "./project-not-found.ts";

declare module "fastify" {
  interface FastifyRequest {
    // Set by requireProject. Only the project scope declares it (null until the hook runs).
    project?: Project | null;
  }
}

const uuid = z.uuid();

// onRequest hook: the logged-in user must have access to :projectId. Runs before the body
// is read, so another user's project is 404 even with a broken body.
// see PITFALLS.md: Project scope runs before the body is read
export function requireProject(db: Database) {
  return async (request: FastifyRequest): Promise<void> => {
    const { projectId } = request.params as { projectId?: unknown };
    // An ID that can't be a UUID can't exist; this also keeps Postgres from raising 22P02
    const parsed = uuid.safeParse(projectId);
    if (!parsed.success) throw projectNotFound();
    const project = await findAccessibleProject(db, getAuthUser(request).id, parsed.data);
    if (!project) throw projectNotFound();
    request.project = project;
  };
}
